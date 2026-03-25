import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Papa from "papaparse";

import { supabase } from "../../lib/supabase";
import { prepareImageWebp } from "../../lib/images/prepareImageWebp";
import { uploadProductImage } from "../../lib/images/uploadProductImage";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "../components/AdminMembershipContext";

// ─── types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, string>;

type ParsedModifierGroup = { name: string; options: string[] };

type ParsedRow = {
  categoria: string;
  nombre: string;
  price: number;
  descripcion: string;
  imagen: string;
  modificadores: ParsedModifierGroup[];
  error?: string;
};

type ImportResult = {
  imported: number;
  imagesOk: number;
  groupsCreated: number;
  errors: Array<{ product: string; reason: string }>;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseModifiers(raw: string): ParsedModifierGroup[] {
  if (!raw.trim()) return [];
  const groups: ParsedModifierGroup[] = [];
  for (const part of raw.split("|")) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const name = part.slice(0, colonIdx).trim();
    const options = part
      .slice(colonIdx + 1)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (name && options.length > 0) groups.push({ name, options });
  }
  return groups;
}

function parseRows(raw: RawRow[]): ParsedRow[] {
  return raw.map((row): ParsedRow => {
    const nombre = (row.nombre ?? "").trim();
    const categoria = (row.categoria ?? "Sin categoría").trim();
    const precioRaw = (row.precio ?? "").replace(",", ".").trim();
    const price = parseFloat(precioRaw);
    const descripcion = (row.descripcion ?? "").trim();
    const imagen = (row.imagen ?? "").trim();
    const modificadores = parseModifiers(row.modificadores ?? "");

    let error: string | undefined;
    if (!nombre) error = "Nombre vacío";
    else if (isNaN(price) || price < 0) error = `Precio inválido: "${row.precio}"`;

    return {
      categoria,
      nombre,
      price: isNaN(price) ? 0 : price,
      descripcion,
      imagen,
      modificadores,
      error,
    };
  });
}

async function fetchAndUploadImage(
  url: string,
  restaurantId: string,
  productId: string
): Promise<string> {
  const resp = await fetch(url, { mode: "cors" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  const file = new File([blob], "image", { type: blob.type });
  const webpBlob = await prepareImageWebp(file);
  return uploadProductImage(supabase, restaurantId, productId, webpBlob);
}

const TEMPLATE_CSV = [
  `categoria,nombre,precio,descripcion,imagen,modificadores`,
  `Principales,Kebab de pollo,7.50,Con salsa especial,https://example.com/kebab.jpg,"Salsas:salsa roja,salsa blanca|Carne:pollo,mixto"`,
  `Principales,Falafel,6.00,Vegano,,`,
  `Bebidas,Agua,1.50,,,`,
].join("\n");

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_menu.csv";
  a.click();
  URL.revokeObjectURL(url);
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
      complete: (results) => setRows(parseRows(results.data)),
      error: () => setRows([]),
    });
  };

  // ── bulk import ──

  const handleImport = async () => {
    if (!canManage || validRows.length === 0 || importing) return;

    setImporting(true);
    setResult(null);

    const errors: ImportResult["errors"] = [];
    let imported = 0;
    let imagesOk = 0;
    let groupsCreated = 0;

    // Group rows by category
    const byCategory = new Map<string, ParsedRow[]>();
    for (const row of validRows) {
      const existing = byCategory.get(row.categoria) ?? [];
      existing.push(row);
      byCategory.set(row.categoria, existing);
    }

    // Fetch existing categories
    const { data: existingCats } = await supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurantId);

    const catMap = new Map<string, string>();
    let nextCatSort = 0;
    for (const cat of existingCats ?? []) {
      const c = cat as { id: string; name: string; sort_order: number };
      catMap.set(c.name.toLowerCase(), c.id);
      if (c.sort_order >= nextCatSort) nextCatSort = c.sort_order + 1;
    }

    // Fetch existing modifier groups
    const { data: existingGroups } = await supabase
      .from("modifier_groups")
      .select("id, name")
      .eq("restaurant_id", restaurantId);

    const groupMap = new Map<string, string>(); // name.toLowerCase() → id
    for (const g of existingGroups ?? []) {
      const mg = g as { id: string; name: string };
      groupMap.set(mg.name.toLowerCase(), mg.id);
    }

    // Process categories and products
    for (const [catName, products] of byCategory) {
      const catKey = catName.toLowerCase();
      let categoryId = catMap.get(catKey);

      if (!categoryId) {
        const { data: newCat, error: catErr } = await supabase
          .from("categories")
          .insert({
            restaurant_id: restaurantId,
            name: catName,
            sort_order: nextCatSort++,
            is_active: true,
          })
          .select("id")
          .single();

        if (catErr || !newCat) {
          for (const prod of products) {
            errors.push({
              product: prod.nombre,
              reason: `Error creando categoría "${catName}": ${catErr?.message ?? "desconocido"}`,
            });
          }
          continue;
        }

        categoryId = (newCat as { id: string }).id;
        catMap.set(catKey, categoryId);
      }

      // Max sort_order in this category
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
        // Insert product (without image_url first)
        const { data: newProd, error: prodErr } = await supabase
          .from("products")
          .insert({
            restaurant_id: restaurantId,
            category_id: categoryId,
            name: prod.nombre,
            price: prod.price,
            description: prod.descripcion || null,
            sort_order: productSort++,
            is_active: true,
          })
          .select("id")
          .single();

        if (prodErr || !newProd) {
          errors.push({
            product: prod.nombre,
            reason: prodErr?.message ?? "Error desconocido al insertar producto",
          });
          continue;
        }

        imported++;
        const productId = (newProd as { id: string }).id;

        // Upload image if provided
        if (prod.imagen) {
          try {
            const imageUrl = await fetchAndUploadImage(prod.imagen, restaurantId, productId);
            await supabase
              .from("products")
              .update({ image_url: imageUrl })
              .eq("id", productId);
            imagesOk++;
          } catch (imgErr) {
            errors.push({
              product: prod.nombre,
              reason: `Imagen no descargada: ${imgErr instanceof Error ? imgErr.message : "error de red"}`,
            });
          }
        }

        // Create / reuse modifier groups
        let modSort = 0;
        for (const group of prod.modificadores) {
          const groupKey = group.name.toLowerCase();
          let groupId = groupMap.get(groupKey);

          if (!groupId) {
            const { data: newGroup, error: groupErr } = await supabase
              .from("modifier_groups")
              .insert({
                restaurant_id: restaurantId,
                name: group.name,
                min_select: 0,
                max_select: 1,
                is_active: true,
                position: 0,
              })
              .select("id")
              .single();

            if (groupErr || !newGroup) {
              errors.push({
                product: prod.nombre,
                reason: `Error creando grupo "${group.name}": ${groupErr?.message ?? "desconocido"}`,
              });
              continue;
            }

            groupId = (newGroup as { id: string }).id;
            groupMap.set(groupKey, groupId);
            groupsCreated++;

            // Insert options for new group
            const optionRows = group.options.map((opt, i) => ({
              restaurant_id: restaurantId,
              group_id: groupId as string,
              name: opt,
              price: 0,
              is_active: true,
              position: i,
            }));
            await supabase.from("modifier_options").insert(optionRows);
          }

          // Link group to product
          await supabase.from("product_modifier_groups").insert({
            product_id: productId,
            group_id: groupId,
            sort_order: modSort,
            position: modSort,
          });
          modSort++;
        }
      }
    }

    setResult({ imported, imagesOk, groupsCreated, errors });
    setImporting(false);

    if (imported > 0) {
      setRows([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <section
      style={{
        display: "grid",
        gap: 18,
        width: "100%",
        maxWidth: 980,
        margin: "0 auto",
        padding: "2px 0 10px",
      }}
    >
      <header
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 18,
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
          display: "grid",
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "clamp(1.3rem, 2vw, 1.65rem)", lineHeight: 1.2, color: "#0f172a" }}>
          Importar menú
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.4 }}>
          Importa categorías y productos desde un archivo CSV
        </p>
      </header>

      {/* Upload + format guide */}
      <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ marginBottom: 4 }}>
          <strong style={{ fontSize: 14, color: "var(--admin-text-primary)" }}>
            Formato esperado
          </strong>
          <p style={{ margin: "4px 0 6px", fontSize: 13, color: "var(--admin-text-secondary)" }}>
            Primera fila: cabecera. Columnas obligatorias:{" "}
            <code style={codeStyle}>categoria, nombre, precio</code>. Opcionales:{" "}
            <code style={codeStyle}>descripcion, imagen, modificadores</code>
          </p>
          <pre style={preStyle}>
{`categoria,nombre,precio,descripcion,imagen,modificadores
Principales,Kebab de pollo,7.50,Con salsa especial,https://ejemplo.com/kebab.jpg,"Salsas:salsa roja,salsa blanca|Carne:pollo,mixto"
Bebidas,Agua,1.50,,,`}
          </pre>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8" }}>
            El CSV antiguo de 4 columnas sigue funcionando. Si el campo modificadores contiene comas, rodéalo con comillas dobles.
          </p>
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...btnSecondaryStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 16px",
              borderRadius: 12,
              border: fileName ? "1px solid #86efac" : "1px solid #cbd5e1",
              background: fileName ? "#f0fdf4" : "#ffffff",
              color: fileName ? "#166534" : "#0f172a",
              fontWeight: 700,
              boxShadow: fileName
                ? "0 6px 16px rgba(34, 197, 94, 0.14)"
                : "0 1px 2px rgba(15, 23, 42, 0.06)",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>↑</span>
            <span>{fileName ? "Archivo cargado" : "Seleccionar archivo CSV"}</span>
          </button>

          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              ...btnSecondaryStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            <span aria-hidden="true">↓</span> Descargar plantilla
          </button>
        </div>

        {fileName ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              border: "1px solid #bbf7d0",
              borderRadius: 999,
              background: "#f0fdf4",
              color: "#166534",
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span aria-hidden="true">✓</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
              {fileName}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#64748b" }}>
            6 columnas: categoria, nombre, precio, descripcion, imagen, modificadores
          </span>
        )}
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
                  {(["Estado", "Categoría", "Nombre", "Precio", "Descripción", "Imagen", "Modificadores"] as const).map(
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
                        <span style={{ color: "#b91c1c", fontSize: 12 }}>✕ {row.error}</span>
                      ) : (
                        <span style={{ color: "#15803d" }}>✓</span>
                      )}
                    </td>
                    <td style={tdStyle}>{row.categoria}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{row.nombre}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {row.error && row.price === 0 ? "—" : `${row.price.toFixed(2)} €`}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--admin-text-secondary)", maxWidth: 200 }}>
                      {row.descripcion || "—"}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {row.imagen ? (
                        <span style={{ color: "#1d4ed8", fontSize: 12 }}>↗ URL</span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {row.modificadores.length > 0 ? (
                        <span style={{ color: "#7c3aed", fontSize: 12 }}>
                          {row.modificadores.length} grupo{row.modificadores.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
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
          <div style={{ display: "grid", gap: 6, marginBottom: result.errors.length > 0 ? 12 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: result.imported > 0 ? "#15803d" : "#374151" }}>
              {result.imported > 0
                ? `✓ ${result.imported} producto${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""} correctamente`
                : "No se importó ningún producto"}
            </div>
            {result.imagesOk > 0 && (
              <div style={{ fontSize: 13, color: "#1d4ed8" }}>
                ↗ {result.imagesOk} imagen{result.imagesOk !== 1 ? "es" : ""} descargada{result.imagesOk !== 1 ? "s" : ""}
              </div>
            )}
            {result.groupsCreated > 0 && (
              <div style={{ fontSize: 13, color: "#7c3aed" }}>
                + {result.groupsCreated} grupo{result.groupsCreated !== 1 ? "s" : ""} de modificadores creado{result.groupsCreated !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          {result.errors.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ fontSize: 13, color: "#b91c1c" }}>
                  <strong>{e.product}</strong>: {e.reason}
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
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "20px 22px",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
};

const codeStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  background: "#eef2f7",
  padding: "2px 6px",
  borderRadius: 6,
  color: "#1f2937",
  border: "1px solid #dbe2ea",
};

const preStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
  fontSize: 12,
  background: "#f3f6fb",
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  padding: "14px 16px",
  margin: "8px 0 0",
  overflowX: "auto",
  color: "#334155",
  lineHeight: 1.6,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
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
