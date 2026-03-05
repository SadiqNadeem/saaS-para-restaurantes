import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Papa from "papaparse";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "../components/AdminMembershipContext";

// ─── types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, string>;

type ParsedRow = {
  categoria: string;
  nombre: string;
  price: number;
  descripcion: string;
  error?: string;
};

type ImportResult = {
  imported: number;
  errors: string[];
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseRows(raw: RawRow[]): ParsedRow[] {
  return raw.map((row): ParsedRow => {
    const nombre = (row.nombre ?? "").trim();
    const categoria = (row.categoria ?? "Sin categoría").trim();
    const precioRaw = (row.precio ?? "").replace(",", ".").trim();
    const price = parseFloat(precioRaw);
    const descripcion = (row.descripcion ?? "").trim();

    let error: string | undefined;
    if (!nombre) error = "Nombre vacío";
    else if (isNaN(price) || price < 0) error = `Precio inválido: "${row.precio}"`;

    return { categoria, nombre, price: isNaN(price) ? 0 : price, descripcion, error };
  });
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AdminImportPage() {
  const { restaurantId } = useRestaurant();
  const { canManage } = useAdminMembership();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  // ── file parsing ──

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResult(null);
    setRows([]);

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (results) => {
        setRows(parseRows(results.data));
      },
      error: () => {
        setRows([]);
      },
    });
  };

  // ── bulk import ──

  const handleImport = async () => {
    if (!canManage || validRows.length === 0 || importing) return;

    setImporting(true);
    setResult(null);

    const errors: string[] = [];
    let imported = 0;

    // Group rows by category name
    const byCategory = new Map<string, ParsedRow[]>();
    for (const row of validRows) {
      const existing = byCategory.get(row.categoria) ?? [];
      existing.push(row);
      byCategory.set(row.categoria, existing);
    }

    // Fetch existing categories for this restaurant
    const { data: existingCats } = await supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurantId);

    const catMap = new Map<string, string>(); // name.toLowerCase() → id
    let nextSortOrder = 0;

    for (const cat of existingCats ?? []) {
      const c = cat as { id: string; name: string; sort_order: number };
      catMap.set(c.name.toLowerCase(), c.id);
      if (c.sort_order >= nextSortOrder) nextSortOrder = c.sort_order + 1;
    }

    // Create missing categories and import products
    for (const [catName, products] of byCategory) {
      const catKey = catName.toLowerCase();
      let categoryId = catMap.get(catKey);

      if (!categoryId) {
        const { data: newCat, error: catErr } = await supabase
          .from("categories")
          .insert({
            restaurant_id: restaurantId,
            name: catName,
            sort_order: nextSortOrder++,
            is_active: true,
          })
          .select("id")
          .single();

        if (catErr || !newCat) {
          errors.push(`Error creando categoría "${catName}": ${catErr?.message ?? "desconocido"}`);
          continue;
        }

        categoryId = (newCat as { id: string }).id;
        catMap.set(catKey, categoryId);
      }

      // Get current max sort_order in this category
      const { data: maxRow } = await supabase
        .from("products")
        .select("sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("category_id", categoryId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      let productSort = maxRow ? ((maxRow as { sort_order: number }).sort_order ?? 0) + 1 : 0;

      for (const prod of products) {
        const { error: prodErr } = await supabase.from("products").insert({
          restaurant_id: restaurantId,
          category_id: categoryId,
          name: prod.nombre,
          price: prod.price,
          description: prod.descripcion || null,
          sort_order: productSort++,
          is_active: true,
        });

        if (prodErr) {
          errors.push(`Error importando "${prod.nombre}": ${prodErr.message}`);
        } else {
          imported++;
        }
      }
    }

    setResult({ imported, errors });
    setImporting(false);
    if (imported > 0) {
      setRows([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 860 }}>
      <header>
        <h2 className="admin-panel" style={{ margin: 0 }}>
          Importar menú
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary)" }}>
          Importa categorías y productos desde un archivo CSV.
        </p>
      </header>

      {/* Upload + format guide */}
      <div style={cardStyle}>
        <div style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 14, color: "var(--admin-text-primary)" }}>
            Formato esperado
          </strong>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--admin-text-secondary)" }}>
            Primera fila: cabecera. Columnas:{" "}
            <code style={codeStyle}>categoria, nombre, precio, descripcion</code>
          </p>
          <pre style={preStyle}>
            {`categoria,nombre,precio,descripcion
Principales,Kebab de pollo,7.50,Con salsa especial
Principales,Falafel,6.00,
Bebidas,Agua,1.50,`}
          </pre>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={btnSecondaryStyle}
        >
          {fileName ? `📄 ${fileName}` : "Seleccionar archivo CSV"}
        </button>
      </div>

      {/* Preview table */}
      {rows.length > 0 ? (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <strong style={{ fontSize: 14, color: "var(--admin-text-primary)" }}>
                {rows.length} filas encontradas
              </strong>
              <span style={{ fontSize: 13, color: "var(--admin-text-secondary)", marginLeft: 8 }}>
                ({validRows.length} válidas
                {errorRows.length > 0 ? `, ${errorRows.length} con error` : ""})
              </span>
            </div>

            {canManage && validRows.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing}
                style={{ ...btnPrimaryStyle, opacity: importing ? 0.7 : 1 }}
              >
                {importing
                  ? "Importando..."
                  : `Importar ${validRows.length} producto${validRows.length !== 1 ? "s" : ""}`}
              </button>
            ) : null}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {(["Estado", "Categoría", "Nombre", "Precio", "Descripción"] as const).map(
                    (col) => (
                      <th key={col} style={thStyle}>
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: row.error ? "#fef2f2" : i % 2 === 0 ? "#fafafa" : "#fff",
                    }}
                  >
                    <td style={tdStyle}>
                      {row.error ? (
                        <span style={{ color: "#b91c1c", fontSize: 12 }}>
                          ✕ {row.error}
                        </span>
                      ) : (
                        <span style={{ color: "#15803d" }}>✓</span>
                      )}
                    </td>
                    <td style={tdStyle}>{row.categoria}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{row.nombre}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {row.error && row.price === 0 ? "—" : `${row.price.toFixed(2)} €`}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--admin-text-secondary)", maxWidth: 240 }}>
                      {row.descripcion || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Result */}
      {result ? (
        <div
          style={{
            ...cardStyle,
            borderColor: result.errors.length === 0 ? "#86efac" : "#fca5a5",
            background: result.errors.length === 0 ? "#f0fdf4" : "#fff",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: result.imported > 0 ? "#15803d" : "var(--admin-text-primary)",
              marginBottom: result.errors.length > 0 ? 10 : 0,
            }}
          >
            {result.imported > 0
              ? `✓ ${result.imported} producto${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""} correctamente`
              : "No se importó ningún producto"}
          </div>
          {result.errors.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ fontSize: 13, color: "#b91c1c" }}>
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  border: "1px solid var(--admin-card-border, #e5e7eb)",
  borderRadius: "var(--admin-radius-md, 12px)",
  background: "var(--admin-card-bg, #fff)",
  padding: "16px 18px",
  boxShadow: "var(--admin-card-shadow)",
};

const codeStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  background: "#f3f4f6",
  padding: "1px 5px",
  borderRadius: 4,
  color: "#374151",
};

const preStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "10px 12px",
  margin: 0,
  overflowX: "auto",
  color: "#374151",
  lineHeight: 1.6,
};

const btnPrimaryStyle: CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 8,
  padding: "9px 18px",
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondaryStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "9px 16px",
  background: "#fff",
  color: "#374151",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--admin-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #f3f4f6",
  color: "var(--admin-text-primary)",
  verticalAlign: "top",
};
