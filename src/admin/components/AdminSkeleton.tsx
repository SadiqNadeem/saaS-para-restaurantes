type TableSkeletonProps = {
  rows?: number;
  cols?: number;
};

export function TableSkeleton({ rows = 5, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table" aria-busy="true" aria-label="Cargando...">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton" style={{ height: 14, width: "70%", minWidth: 60 }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx}>
                  <div
                    className="skeleton"
                    style={{
                      height: 14,
                      width: colIdx === 0 ? "80%" : `${50 + (colIdx * 13) % 40}%`,
                      minWidth: 40,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CardSkeletonProps = {
  count?: number;
};

export function CardSkeleton({ count = 3 }: CardSkeletonProps) {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-busy="true" aria-label="Cargando...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="admin-card"
          style={{ display: "grid", gap: 10 }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <div className="skeleton" style={{ height: 14, width: "60%" }} />
              <div className="skeleton" style={{ height: 12, width: "35%" }} />
            </div>
            <div className="skeleton" style={{ height: 24, width: 70, borderRadius: 99 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="skeleton" style={{ height: 12, width: "25%" }} />
            <div className="skeleton" style={{ height: 12, width: "20%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
