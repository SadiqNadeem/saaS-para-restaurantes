import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import type { RestaurantTable } from "../services/posOrderService";
import { openTableOrder } from "../services/posOrderService";

// ─── Types ────────────────────────────────────────────────────────────────────

type FloorTable = RestaurantTable & {
  _isNew?: boolean;
  _isDirty?: boolean;
  _isDeleted?: boolean;
  order_created_at?: string;
  order_total?: number;
};

type FloorWall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: string;
  _isNew?: boolean;
  _isDeleted?: boolean;
};

type DragState = {
  tableId: string;
  startMouseX: number;
  startMouseY: number;
  startPosX: number;
  startPosY: number;
};

type ResizeState = {
  tableId: string;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
  isCircle: boolean;
};

// ─── Constants / Helpers ──────────────────────────────────────────────────────

const GRID = 20;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function elapsedLabel(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const ZONE_OPTIONS = ["Sala", "Terraza", "Barra"];

const WALL_COLORS: Array<{ label: string; value: string }> = [
  { label: "Gris", value: "#64748b" },
  { label: "Negro", value: "#1e293b" },
  { label: "Marrón", value: "#92400e" },
  { label: "Rojo", value: "#991b1b" },
];

const WALL_THICKNESSES = [4, 8, 16] as const;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PosFloorPlanPage() {
  const { restaurantId } = useRestaurant();
  const navigate = useNavigate();

  const posBase = window.location.pathname.includes("/r/")
    ? window.location.pathname.split("/pos")[0] + "/pos"
    : "/pos";

  // ── Modes & tools ──
  const [mode, setMode] = useState<"service" | "edit">("service");
  const [activeTool, setActiveTool] = useState<"tables" | "walls">("tables");

  // ── Data ──
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [walls, setWalls] = useState<FloorWall[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Selection ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  // ── UI state ──
  const [toast, setToast] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState("Todas");
  const [openingId, setOpeningId] = useState<string | null>(null);

  // ── Wall drawing presets ──
  const [wallThickness, setWallThickness] = useState<number>(8);
  const [wallColor, setWallColor] = useState<string>("#64748b");
  const [wallPreview, setWallPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ── Refs ──
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const wallDrawRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Keep current wallThickness/wallColor in ref so handleMouseUp can read without stale closure
  const wallThicknessRef = useRef(wallThickness);
  const wallColorRef = useRef(wallColor);
  useEffect(() => { wallThicknessRef.current = wallThickness; }, [wallThickness]);
  useEffect(() => { wallColorRef.current = wallColor; }, [wallColor]);

  // ── Canvas coordinate helper ──
  function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: snap(clientX - rect.left + canvas.scrollLeft),
      y: snap(clientY - rect.top + canvas.scrollTop),
    };
  }

  // ── Load all data ──
  const loadAll = useCallback(async () => {
    const [tableRes, wallRes] = await Promise.all([
      supabase
        .from("restaurant_tables")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("position", { ascending: true }),
      supabase
        .from("restaurant_floor_walls")
        .select("*")
        .eq("restaurant_id", restaurantId),
    ]);

    // Process walls
    setWalls((wallRes.data ?? []) as FloorWall[]);

    // Process tables with order data
    if (tableRes.error || !tableRes.data) {
      setLoading(false);
      return;
    }
    const rows = tableRes.data as RestaurantTable[];
    const orderIds = rows.filter((t) => t.current_order_id).map((t) => t.current_order_id as string);

    if (orderIds.length === 0) {
      setTables(rows.map((r) => ({ ...r })));
      setLoading(false);
      return;
    }

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, created_at, total, subtotal")
      .in("id", orderIds);

    type OrderRow = { id: string; created_at: string; total: number | null; subtotal: number | null };
    const orderMap = new Map((ordersData ?? []).map((o) => [(o as OrderRow).id, o as OrderRow]));

    setTables(
      rows.map((t) => {
        if (!t.current_order_id) return { ...t };
        const o = orderMap.get(t.current_order_id);
        return {
          ...t,
          order_created_at: o?.created_at,
          order_total: Number(o?.total ?? o?.subtotal ?? 0),
        };
      })
    );
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Realtime subscription (service mode) ──
  useEffect(() => {
    if (mode !== "service") return;
    const channel = supabase
      .channel("floor-plan-rt-" + restaurantId)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables", filter: `restaurant_id=eq.${restaurantId}` }, () => void loadAll())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [restaurantId, mode, loadAll]);

  // ── Keyboard: Delete/Backspace removes selected wall ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (selectedWallId) {
        deleteWall(selectedWallId);
        setSelectedWallId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedWallId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mode switch ──
  const switchToService = () => {
    void loadAll();
    setMode("service");
    setSelectedId(null);
    setSelectedWallId(null);
    setWallPreview(null);
    wallDrawRef.current = null;
  };

  const switchToEdit = () => setMode("edit");

  // ── Add table (local only) ──
  const handleAddTable = () => {
    const maxNum = tables.reduce((max, t) => {
      const m = t.name.match(/\d+/);
      return m ? Math.max(max, parseInt(m[0])) : max;
    }, 0);
    const idx = tables.filter((t) => !t._isDeleted).length;
    const newTable: FloorTable = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      name: `Mesa ${maxNum + 1}`,
      zone: "Sala",
      capacity: null,
      status: "free",
      current_order_id: null,
      is_active: true,
      position: tables.length,
      created_at: new Date().toISOString(),
      qr_token: null,
      shape: "square",
      pos_x: snap(60 + (idx % 5) * 140),
      pos_y: snap(60 + Math.floor(idx / 5) * 140),
      width: 100,
      height: 100,
      merged_with: null,
      is_merged_child: false,
      merged_parent_id: null,
      _isNew: true,
      _isDirty: true,
    };
    setTables((prev) => [...prev, newTable]);
    setSelectedId(newTable.id);
    setSelectedWallId(null);
  };

  // ── Save floor plan (tables + walls) ──
  const handleSave = async () => {
    setSaving(true);
    try {
      // ── Tables ──
      const toDeleteTables = tables.filter((t) => t._isDeleted && !t._isNew);
      const toInsertTables = tables.filter((t) => t._isNew && !t._isDeleted);
      const toUpdateTables = tables.filter((t) => !t._isNew && !t._isDeleted && t._isDirty);

      if (toDeleteTables.length > 0) {
        const { error } = await supabase.from("restaurant_tables").delete().in("id", toDeleteTables.map((t) => t.id));
        if (error) throw new Error(error.message);
      }
      for (const t of toInsertTables) {
        const { error } = await supabase.from("restaurant_tables").insert({
          restaurant_id: restaurantId,
          name: t.name, zone: t.zone, capacity: t.capacity, position: t.position,
          shape: t.shape, pos_x: t.pos_x, pos_y: t.pos_y, width: t.width, height: t.height,
          merged_parent_id: t.merged_parent_id, is_merged_child: t.is_merged_child,
        });
        if (error) throw new Error(error.message);
      }
      for (const t of toUpdateTables) {
        const { error } = await supabase.from("restaurant_tables").update({
          name: t.name, zone: t.zone, capacity: t.capacity,
          shape: t.shape, pos_x: t.pos_x, pos_y: t.pos_y, width: t.width, height: t.height,
          merged_parent_id: t.merged_parent_id, is_merged_child: t.is_merged_child,
        }).eq("id", t.id);
        if (error) throw new Error(error.message);
      }

      // ── Walls: delete all then re-insert current ──
      await supabase.from("restaurant_floor_walls").delete().eq("restaurant_id", restaurantId);
      const wallsToSave = walls.filter((w) => !w._isDeleted);
      if (wallsToSave.length > 0) {
        const { error } = await supabase.from("restaurant_floor_walls").insert(
          wallsToSave.map((w) => ({
            restaurant_id: restaurantId,
            x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
            thickness: w.thickness, color: w.color,
          }))
        );
        if (error) throw new Error(error.message);
      }

      const savedTables = toInsertTables.length + toUpdateTables.length + (tables.filter(t => !t._isNew && !t._isDirty && !t._isDeleted).length);
      showToast(`Plano guardado (${savedTables} mesas, ${wallsToSave.length} paredes)`);
      await loadAll();
      setMode("service");
      setSelectedId(null);
      setSelectedWallId(null);
    } catch (e) {
      showToast("Error al guardar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── Wall operations ──
  function deleteWall(id: string) {
    setWalls((prev) => prev.map((w) => (w.id === id ? { ...w, _isDeleted: true } : w)));
  }

  function updateWall(id: string, patch: Partial<FloorWall>) {
    setWalls((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  // ── Mouse/Touch handlers ──

  function getEventCanvasCoords(e: React.MouseEvent | MouseEvent): { x: number; y: number } {
    return getCanvasCoords(e.clientX, e.clientY);
  }

  // Table mousedown: start drag (tables tool only); always stopPropagation to prevent wall drawing
  const handleMouseDownTable = (e: React.MouseEvent, table: FloorTable) => {
    if (mode !== "edit") return;
    e.stopPropagation(); // prevent inner-div wall drawing
    if (activeTool !== "tables") return;
    if ((e.target as HTMLElement).dataset.resize) return;
    e.preventDefault();
    isDraggingRef.current = false;
    dragRef.current = {
      tableId: table.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: table.pos_x,
      startPosY: table.pos_y,
    };
  };

  const handleTouchStartTable = (e: React.TouchEvent, table: FloorTable) => {
    if (mode !== "edit" || activeTool !== "tables") return;
    const touch = e.touches[0];
    isDraggingRef.current = false;
    dragRef.current = {
      tableId: table.id,
      startMouseX: touch.clientX,
      startMouseY: touch.clientY,
      startPosX: table.pos_x,
      startPosY: table.pos_y,
    };
  };

  // Inner canvas div mousedown: start wall drawing (walls tool) or deselect on background click
  const handleInnerMouseDown = (e: React.MouseEvent) => {
    if (mode !== "edit") return;
    // Deselect everything when clicking canvas background
    setSelectedId(null);
    setSelectedWallId(null);

    if (activeTool !== "walls") return;

    isDraggingRef.current = false;
    const { x, y } = getEventCanvasCoords(e);
    wallDrawRef.current = { x1: x, y1: y, x2: x, y2: y };
    setWallPreview({ x1: x, y1: y, x2: x, y2: y });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    // Table drag
    if (dragRef.current) {
      const { tableId, startMouseX, startMouseY, startPosX, startPosY } = dragRef.current;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDraggingRef.current = true;
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? { ...t, pos_x: Math.max(0, snap(startPosX + dx)), pos_y: Math.max(0, snap(startPosY + dy)), _isDirty: true }
            : t
        )
      );
      return;
    }

    // Table resize
    if (resizeRef.current) {
      const { tableId, startMouseX, startMouseY, startWidth, startHeight, isCircle } = resizeRef.current;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      isDraggingRef.current = true;
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          const delta = isCircle ? Math.max(dx, dy) : 0;
          const newW = isCircle ? Math.min(300, Math.max(60, snap(startWidth + delta))) : Math.min(300, Math.max(60, snap(startWidth + dx)));
          const newH = isCircle ? newW : Math.min(300, Math.max(60, snap(startHeight + dy)));
          return { ...t, width: newW, height: newH, _isDirty: true };
        })
      );
      return;
    }

    // Wall drawing preview
    if (wallDrawRef.current) {
      const { x, y } = getEventCanvasCoords(e);
      wallDrawRef.current = { ...wallDrawRef.current, x2: x, y2: y };
      setWallPreview({ ...wallDrawRef.current, x2: x, y2: y });
    }
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || !dragRef.current) return;
    const { tableId, startMouseX, startMouseY, startPosX, startPosY } = dragRef.current;
    const dx = touch.clientX - startMouseX;
    const dy = touch.clientY - startMouseY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDraggingRef.current = true;
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId
          ? { ...t, pos_x: Math.max(0, snap(startPosX + dx)), pos_y: Math.max(0, snap(startPosY + dy)), _isDirty: true }
          : t
      )
    );
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    resizeRef.current = null;

    // Finish wall drawing
    if (wallDrawRef.current) {
      const { x1, y1, x2, y2 } = wallDrawRef.current;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > 20) {
        const newWall: FloorWall = {
          id: crypto.randomUUID(),
          x1, y1, x2, y2,
          thickness: wallThicknessRef.current,
          color: wallColorRef.current,
          _isNew: true,
        };
        setWalls((prev) => [...prev, newWall]);
      }
      wallDrawRef.current = null;
      setWallPreview(null);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, table: FloorTable) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = false;
    resizeRef.current = {
      tableId: table.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWidth: table.width,
      startHeight: table.height,
      isCircle: table.shape === "circle",
    };
  };

  // ── Table click ──
  const handleTableClick = async (table: FloorTable) => {
    if (isDraggingRef.current) return;

    if (mode === "edit") {
      setSelectedId((prev) => (prev === table.id ? null : table.id));
      setSelectedWallId(null);
      return;
    }

    // Service mode
    if (table.status === "free") {
      setOpeningId(table.id);
      try {
        await openTableOrder(restaurantId, table.id, table.name);
        navigate(`${posBase}/tables/${table.id}`, { state: { from: "floor-plan" } });
      } catch (e) {
        showToast("Error al abrir mesa: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        setOpeningId(null);
      }
    } else {
      navigate(`${posBase}/tables/${table.id}`, { state: { from: "floor-plan" } });
    }
  };

  // ── Table update/delete/merge ──
  const updateSelected = (patch: Partial<FloorTable>) => {
    if (!selectedId) return;
    setTables((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch, _isDirty: true } : t)));
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const table = tables.find((t) => t.id === selectedId);
    if (!table) return;
    if (table.status === "occupied") { showToast("No se puede eliminar una mesa ocupada"); return; }
    if (!window.confirm(`¿Eliminar "${table.name}"?`)) return;
    if (table._isNew) {
      setTables((prev) => prev.filter((t) => t.id !== selectedId));
    } else {
      setTables((prev) => prev.map((t) => (t.id === selectedId ? { ...t, _isDeleted: true } : t)));
    }
    setSelectedId(null);
  };

  const handleMerge = (parentId: string, childId: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id === parentId) return { ...t, _isDirty: true };
        if (t.id === childId) return { ...t, merged_parent_id: parentId, is_merged_child: true, _isDirty: true };
        return t;
      })
    );
  };

  const handleSeparate = (parentId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.merged_parent_id === parentId ? { ...t, merged_parent_id: null, is_merged_child: false, _isDirty: true } : t
      )
    );
  };

  // ── Derived ──
  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;
  const selectedWall = walls.find((w) => w.id === selectedWallId && !w._isDeleted) ?? null;
  const zones = ["Todas", ...Array.from(new Set(tables.map((t) => t.zone)))];
  const visibleTables = tables.filter(
    (t) => !t._isDeleted && !t.is_merged_child && (zoneFilter === "Todas" || t.zone === zoneFilter)
  );
  const visibleWalls = walls.filter((w) => !w._isDeleted);
  const allMergeChildren = tables.filter((t) => t.merged_parent_id && !t._isDeleted);

  // Which panel to show on right
  const showWallPanel = mode === "edit" && selectedWall !== null;
  const showTablePanel = mode === "edit" && selectedTable !== null && !showWallPanel;

  // Canvas cursor
  const canvasCursor = mode === "edit" && activeTool === "walls" ? "crosshair" : "default";

  // ── Render ──
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#475569", background: "#0f172a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Cargando plano...
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#0f172a", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ─── Toolbar ─── */}
      <div style={{ flexShrink: 0, padding: "10px 20px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Title + mode toggle */}
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, marginRight: 4 }}>Plano de sala</h1>
        <button
          type="button"
          onClick={mode === "service" ? switchToEdit : switchToService}
          style={{ padding: "6px 13px", borderRadius: 7, border: "1px solid", borderColor: mode === "edit" ? "#fbbf24" : "#334155", background: mode === "edit" ? "rgba(251,191,36,0.12)" : "transparent", color: mode === "edit" ? "#fbbf24" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {mode === "service" ? "Editar plano" : "Modo servicio"}
        </button>

        {/* Zone filter pills */}
        <div style={{ display: "flex", gap: 4 }}>
          {zones.map((z) => (
            <button key={z} type="button" onClick={() => setZoneFilter(z)}
              style={{ padding: "4px 11px", borderRadius: 20, border: "1px solid", borderColor: zoneFilter === z ? "#4ade80" : "#334155", background: zoneFilter === z ? "rgba(74,222,128,0.15)" : "transparent", color: zoneFilter === z ? "#4ade80" : "#94a3b8", fontSize: 12, fontWeight: zoneFilter === z ? 700 : 500, cursor: "pointer" }}>
              {z}
            </button>
          ))}
        </div>

        {/* Edit-mode controls */}
        {mode === "edit" && (
          <>
            {/* Separator */}
            <div style={{ width: 1, height: 24, background: "#334155", marginLeft: 4 }} />

            {/* Tool selector */}
            <div style={{ display: "flex", gap: 3 }}>
              <button
                type="button"
                onClick={() => setActiveTool("tables")}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid", borderColor: activeTool === "tables" ? "#60a5fa" : "#334155", background: activeTool === "tables" ? "rgba(96,165,250,0.15)" : "transparent", color: activeTool === "tables" ? "#60a5fa" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Mesas
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("walls")}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid", borderColor: activeTool === "walls" ? "#60a5fa" : "#334155", background: activeTool === "walls" ? "rgba(96,165,250,0.15)" : "transparent", color: activeTool === "walls" ? "#60a5fa" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Paredes
              </button>
            </div>

            {/* Wall presets (only when walls tool active) */}
            {activeTool === "walls" && (
              <>
                <div style={{ display: "flex", gap: 3 }}>
                  {WALL_THICKNESSES.map((t) => (
                    <button key={t} type="button" onClick={() => setWallThickness(t)}
                      style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid", borderColor: wallThickness === t ? "#94a3b8" : "#334155", background: wallThickness === t ? "rgba(148,163,184,0.15)" : "transparent", color: wallThickness === t ? "#f1f5f9" : "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      {t}px
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {WALL_COLORS.map(({ label, value }) => (
                    <button key={value} type="button" onClick={() => setWallColor(value)}
                      style={{ padding: "5px 9px", borderRadius: 6, border: "2px solid", borderColor: wallColor === value ? "#f1f5f9" : "transparent", background: value, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Action buttons */}
            {activeTool === "tables" && (
              <button
                type="button"
                onClick={handleAddTable}
                style={{ padding: "6px 13px", borderRadius: 7, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                + Añadir mesa
              </button>
            )}
            <button
              type="button"
              onClick={switchToService}
              style={{ padding: "6px 13px", borderRadius: 7, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: saving ? "#166534" : "#4ade80", color: "#052e16", fontSize: 12, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Guardando..." : "Guardar plano"}
            </button>
          </>
        )}
      </div>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ─── Canvas ─── */}
        <div
          ref={canvasRef}
          onMouseMove={handleMouseMoveCanvas}
          onTouchMove={handleTouchMoveCanvas}
          onTouchEnd={handleMouseUp}
          style={{ flex: 1, position: "relative", overflow: "auto", background: "#0f172a", backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)", backgroundSize: "20px 20px", cursor: canvasCursor }}
        >
          {/* Inner content div — mousedown starts wall drawing */}
          <div
            onMouseDown={handleInnerMouseDown}
            style={{ minWidth: 900, minHeight: 600, position: "relative" }}
          >
            {/* ── SVG layer: walls + merge lines + preview ── */}
            <svg
              style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
              width="100%"
              height="100%"
            >
              {/* Walls */}
              {visibleWalls.map((wall) => {
                const isSelected = wall.id === selectedWallId;
                return (
                  <g key={wall.id} style={{ pointerEvents: mode === "edit" ? "all" : "none" }}>
                    {/* Wide transparent hit area */}
                    <line
                      x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke="transparent"
                      strokeWidth={24}
                      strokeLinecap="round"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWallId(wall.id);
                        setSelectedId(null);
                      }}
                    />
                    {/* Visual line */}
                    <line
                      x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke={isSelected ? "#3b82f6" : wall.color}
                      strokeWidth={isSelected ? wall.thickness + 3 : wall.thickness}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {/* Delete button on selected wall midpoint */}
              {mode === "edit" && selectedWall && (() => {
                const mx = (selectedWall.x1 + selectedWall.x2) / 2;
                const my = (selectedWall.y1 + selectedWall.y2) / 2;
                return (
                  <g
                    style={{ cursor: "pointer", pointerEvents: "all" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWall(selectedWall.id);
                      setSelectedWallId(null);
                    }}
                  >
                    <circle cx={mx} cy={my} r={11} fill="#ef4444" />
                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={15} fontWeight="bold" style={{ userSelect: "none" }}>×</text>
                  </g>
                );
              })()}

              {/* Merge lines */}
              {allMergeChildren.map((child) => {
                const parent = tables.find((p) => p.id === child.merged_parent_id);
                if (!parent || parent._isDeleted) return null;
                return (
                  <line
                    key={child.id}
                    x1={parent.pos_x + parent.width / 2} y1={parent.pos_y + parent.height / 2}
                    x2={child.pos_x + child.width / 2} y2={child.pos_y + child.height / 2}
                    stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" opacity={0.6}
                  />
                );
              })}

              {/* Wall preview while drawing */}
              {wallPreview && (
                <line
                  x1={wallPreview.x1} y1={wallPreview.y1}
                  x2={wallPreview.x2} y2={wallPreview.y2}
                  stroke={wallColor}
                  strokeWidth={wallThickness}
                  strokeLinecap="round"
                  strokeDasharray="10 6"
                  opacity={0.55}
                />
              )}
            </svg>

            {/* ── Table divs ── */}
            {visibleTables.map((table) => {
              const isFree = table.status === "free";
              const isOccupied = table.status === "occupied";
              const isSelected = selectedId === table.id;
              const isOpening = openingId === table.id;

              const bg = isFree ? "#1e293b" : isOccupied ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.12)";
              const borderColor = isSelected ? "#60a5fa" : isFree ? "#334155" : isOccupied ? "rgba(74,222,128,0.5)" : "rgba(251,191,36,0.5)";
              const borderRadius = table.shape === "circle" ? "50%" : table.shape === "rectangle" ? 10 : 12;

              return (
                <div
                  key={table.id}
                  onMouseDown={(e) => handleMouseDownTable(e, table)}
                  onTouchStart={(e) => handleTouchStartTable(e, table)}
                  onClick={() => void handleTableClick(table)}
                  style={{
                    position: "absolute",
                    left: table.pos_x, top: table.pos_y,
                    width: table.width, height: table.height,
                    borderRadius, background: bg,
                    border: `${isSelected ? "2px" : "1.5px"} solid ${borderColor}`,
                    boxShadow: isSelected ? "0 0 0 3px rgba(96,165,250,0.3)" : table._isNew ? "0 0 0 2px rgba(74,222,128,0.3)" : undefined,
                    cursor: mode === "edit" && activeTool === "tables" ? "grab" : mode === "edit" ? "pointer" : isOpening ? "wait" : "pointer",
                    userSelect: "none",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 2, boxSizing: "border-box", overflow: "hidden", padding: 4,
                    transition: "border-color 0.12s, box-shadow 0.12s",
                    opacity: isOpening ? 0.7 : 1,
                  }}
                >
                  <span style={{ fontSize: Math.max(10, Math.min(14, table.width / 8)), fontWeight: 800, color: "#f1f5f9", textAlign: "center", lineHeight: 1.2, padding: "0 4px" }}>
                    {table.name}
                  </span>
                  {table.capacity && <span style={{ fontSize: 10, color: "#64748b" }}>{table.capacity} pax</span>}
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: isFree ? "#475569" : isOccupied ? "#4ade80" : "#fbbf24" }}>
                    {isFree ? "libre" : isOccupied ? "ocupada" : "cobrando"}
                  </span>
                  {(isOccupied || table.status === "closing") && table.order_total !== undefined && table.order_total > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: isOccupied ? "#4ade80" : "#fbbf24" }}>{fmtEur(table.order_total)}</span>
                  )}
                  {(isOccupied || table.status === "closing") && table.order_created_at && (
                    <span style={{ fontSize: 9, color: "#64748b" }}>{elapsedLabel(table.order_created_at)}</span>
                  )}
                  {mode === "edit" && activeTool === "tables" && (
                    <div
                      data-resize="1"
                      onMouseDown={(e) => handleResizeMouseDown(e, table)}
                      style={{ position: "absolute", bottom: 3, right: 3, width: 10, height: 10, background: "#60a5fa", borderRadius: 2, cursor: "se-resize", flexShrink: 0 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Right panel ─── */}
        {showWallPanel && selectedWall && (
          <WallPanel
            wall={selectedWall}
            onUpdate={(patch) => updateWall(selectedWall.id, patch)}
            onDelete={() => { deleteWall(selectedWall.id); setSelectedWallId(null); }}
            onClose={() => setSelectedWallId(null)}
          />
        )}
        {showTablePanel && selectedTable && (
          <TablePanel
            table={selectedTable}
            allTables={tables}
            onUpdate={updateSelected}
            onDelete={handleDeleteSelected}
            onMerge={handleMerge}
            onSeparate={handleSeparate}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* ─── Toast ─── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 600, color: "#f1f5f9", zIndex: 9000, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Wall right panel ─────────────────────────────────────────────────────────

function WallPanel({
  wall,
  onUpdate,
  onDelete,
  onClose,
}: {
  wall: FloorWall;
  onUpdate: (patch: Partial<FloorWall>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ width: 240, flexShrink: 0, background: "#1e293b", borderLeft: "1px solid #334155", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={labelStyle}>Pared seleccionada</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Thickness */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={labelStyle}>Grosor</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{wall.thickness}px</span>
          </div>
          <input
            type="range"
            min={4}
            max={20}
            step={2}
            value={wall.thickness}
            onChange={(e) => onUpdate({ thickness: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "#60a5fa" }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {WALL_THICKNESSES.map((t) => (
              <button key={t} type="button" onClick={() => onUpdate({ thickness: t })}
                style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "1px solid", borderColor: wall.thickness === t ? "#60a5fa" : "#334155", background: wall.thickness === t ? "rgba(96,165,250,0.15)" : "transparent", color: wall.thickness === t ? "#60a5fa" : "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {t}px
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelStyle}>Color</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WALL_COLORS.map(({ label, value }) => (
              <button key={value} type="button" onClick={() => onUpdate({ color: value })}
                style={{ padding: "7px 10px", borderRadius: 6, border: "2px solid", borderColor: wall.color === value ? "#f1f5f9" : "transparent", background: value, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Delete */}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #1e293b" }}>
          <button type="button" onClick={onDelete}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Eliminar pared
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table right panel ────────────────────────────────────────────────────────

function TablePanel({
  table,
  allTables,
  onUpdate,
  onDelete,
  onMerge,
  onSeparate,
  onClose,
}: {
  table: FloorTable;
  allTables: FloorTable[];
  onUpdate: (patch: Partial<FloorTable>) => void;
  onDelete: () => void;
  onMerge: (parentId: string, childId: string) => void;
  onSeparate: (parentId: string) => void;
  onClose: () => void;
}) {
  const [showMergePicker, setShowMergePicker] = useState(false);

  const hasChildren = allTables.some((t) => t.merged_parent_id === table.id && !t._isDeleted);
  const mergeableTables = allTables.filter(
    (t) => t.id !== table.id && !t._isDeleted && !t.is_merged_child && t.status === "free" && t.merged_parent_id === null
  );

  const shapeOptions: Array<{ shape: "square" | "rectangle" | "circle"; label: string; icon: string }> = [
    { shape: "square", label: "Cuadrada", icon: "■" },
    { shape: "rectangle", label: "Rect.", icon: "▬" },
    { shape: "circle", label: "Redonda", icon: "●" },
  ];

  return (
    <div style={{ width: 260, flexShrink: 0, background: "#1e293b", borderLeft: "1px solid #334155", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={labelStyle}>Mesa seleccionada</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Nombre</span>
          <input value={table.name} onChange={(e) => onUpdate({ name: e.target.value })} style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Zona</span>
          <select value={table.zone} onChange={(e) => onUpdate({ zone: e.target.value })} style={inputStyle}>
            {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Capacidad</span>
          <input type="number" min={1} max={50} value={table.capacity ?? ""}
            onChange={(e) => onUpdate({ capacity: e.target.value ? Number(e.target.value) : null })}
            style={{ ...inputStyle, width: 90 }} />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Forma</span>
          <div style={{ display: "flex", gap: 6 }}>
            {shapeOptions.map(({ shape, label, icon }) => (
              <button key={shape} type="button"
                onClick={() => onUpdate({ shape, width: shape === "rectangle" ? 160 : 100, height: 100 })}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 6, border: "1px solid", borderColor: table.shape === shape ? "#4ade80" : "#334155", background: table.shape === shape ? "rgba(74,222,128,0.15)" : "transparent", color: table.shape === shape ? "#4ade80" : "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {!table.is_merged_child && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Unir mesas</span>
            {hasChildren ? (
              <button type="button" onClick={() => onSeparate(table.id)}
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "rgba(245,158,11,0.1)", color: "#fbbf24", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Separar mesas
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setShowMergePicker((v) => !v)}
                  style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Unir con otra mesa
                </button>
                {showMergePicker && (
                  <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, overflow: "hidden" }}>
                    {mergeableTables.length === 0 ? (
                      <p style={{ padding: "8px 12px", fontSize: 12, color: "#475569", margin: 0 }}>No hay otras mesas disponibles</p>
                    ) : mergeableTables.map((t) => (
                      <button key={t.id} type="button"
                        onClick={() => { onMerge(table.id, t.id); setShowMergePicker(false); }}
                        style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid #1e293b", background: "transparent", color: "#94a3b8", fontSize: 13, textAlign: "left", cursor: "pointer" }}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #1e293b" }}>
          <button type="button" onClick={onDelete} disabled={table.status === "occupied"}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: table.status === "occupied" ? "not-allowed" : "pointer", opacity: table.status === "occupied" ? 0.5 : 1 }}>
            Eliminar mesa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const inputStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#f1f5f9",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
