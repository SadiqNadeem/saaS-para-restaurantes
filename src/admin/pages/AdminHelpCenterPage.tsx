import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
} from "../help/helpArticles";

const POPULAR_IDS = ["settings-001", "menu-001", "delivery-001"];

// ── Article card ─────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  onClick,
}: {
  article: HelpArticle;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cat = HELP_CATEGORIES.find((c) => c.id === article.category);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        background: hovered ? "#f9fafb" : "#fff",
        border: "1px solid var(--admin-card-border, #e5e7eb)",
        borderRadius: "var(--admin-radius-md, 12px)",
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "background 0.15s, border-color 0.15s, transform 0.12s",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered
          ? "0 4px 12px rgba(0,0,0,0.08)"
          : "var(--admin-card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          {cat && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--brand-hover)",
                background: "var(--brand-primary-soft)",
                border: "1px solid var(--brand-primary-border)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              {cat.icon} {cat.label.replace(/^.{2}\s/, "")}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--admin-text-muted, #9ca3af)" }}>
            {article.readTime} min de lectura
          </span>
        </div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--admin-text-primary, #111827)",
            marginBottom: 3,
          }}
        >
          {article.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--admin-text-secondary, #6b7280)" }}>
          {article.description}
        </div>
      </div>
      <span style={{ color: "var(--admin-text-muted, #9ca3af)", fontSize: 18, flexShrink: 0 }}>
        →
      </span>
    </button>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  count,
  active,
  onClick,
}: {
  category: (typeof HELP_CATEGORIES)[number];
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active
          ? "var(--brand-primary-soft)"
          : hovered
            ? "#f9fafb"
            : "#fff",
        border: active
          ? "1.5px solid var(--brand-primary-border)"
          : `1px solid ${hovered ? "#d1d5db" : "var(--admin-card-border, #e5e7eb)"}`,
        borderRadius: "var(--admin-radius-md, 12px)",
        padding: "14px 12px",
        cursor: "pointer",
        textAlign: "center",
        transition: "all 0.15s",
        transform: hovered && !active ? "translateY(-1px)" : "none",
        boxShadow: hovered ? "0 4px 12px rgba(0,0,0,0.07)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>{category.icon}</div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: active ? "var(--brand-hover)" : "var(--admin-text-primary, #111827)",
          lineHeight: 1.3,
        }}
      >
        {category.label.replace(/^.{2}\s/, "")}
      </div>
      <div style={{ fontSize: 11, color: "var(--admin-text-muted, #9ca3af)", marginTop: 3 }}>
        {count} artículo{count !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

// ── ArticleDetail ─────────────────────────────────────────────────────────────

function ArticleDetail({
  article,
  onBack,
  onOpenChat,
  onArticleClick,
}: {
  article: HelpArticle;
  onBack: () => void;
  onOpenChat: () => void;
  onArticleClick: (id: string) => void;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const cat = HELP_CATEGORIES.find((c) => c.id === article.category);

  const related = article.relatedArticles
    ?.map((id) => HELP_ARTICLES.find((a) => a.id === id))
    .filter(Boolean) as HelpArticle[] | undefined;

  return (
    <div>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--brand-hover)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          padding: "0 0 16px 0",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Volver
      </button>

      {/* Article header */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          borderRadius: "var(--admin-radius-lg, 16px)",
          padding: "24px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {cat && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--brand-hover)",
                background: "var(--brand-primary-soft)",
                border: "1px solid var(--brand-primary-border)",
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {cat.icon} {cat.label.replace(/^.{2}\s/, "")}
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--admin-text-muted, #9ca3af)" }}>
            {article.readTime} min de lectura
          </span>
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--admin-text-primary, #111827)",
            margin: "0 0 8px",
          }}
        >
          {article.title}
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-text-secondary, #6b7280)", margin: 0 }}>
          {article.description}
        </p>

        {/* Video embed */}
        {article.videoUrl && (
          <div style={{ marginTop: 20, borderRadius: 10, overflow: "hidden", aspectRatio: "16/9" }}>
            <iframe
              src={article.videoUrl}
              title={article.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        )}
      </div>

      {/* Article content */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          borderRadius: "var(--admin-radius-lg, 16px)",
          padding: "24px",
          marginBottom: 16,
        }}
      >
        <div className="help-article-content">
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </div>
      </div>

      {/* Related articles */}
      {related && related.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--admin-card-border, #e5e7eb)",
            borderRadius: "var(--admin-radius-lg, 16px)",
            padding: "20px 24px",
            marginBottom: 16,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--admin-text-primary)" }}>
            Artículos relacionados
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {related.map((rel) => (
              <ArticleCard key={rel.id} article={rel} onClick={() => onArticleClick(rel.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          borderRadius: "var(--admin-radius-lg, 16px)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text-primary)", marginBottom: 8 }}>
            ¿Te fue útil este artículo?
          </div>
          {feedback === null ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFeedback("up")}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fff",
                  padding: "6px 14px",
                  fontSize: 18,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.borderColor = "var(--brand-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
              >
                
              </button>
              <button
                type="button"
                onClick={() => setFeedback("down")}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fff",
                  padding: "6px 14px",
                  fontSize: 18,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#ef4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
              >
                
              </button>
            </div>
          ) : feedback === "up" ? (
            <span style={{ fontSize: 13, color: "var(--brand-primary)", fontWeight: 600 }}>
              ¡Gracias! Nos alegra haber ayudado 
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              Lo sentimos. Seguiremos mejorando.
            </span>
          )}
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "var(--admin-text-secondary)", marginBottom: 8 }}>
            ¿Necesitas más ayuda?
          </div>
          <button
            type="button"
            onClick={onOpenChat}
            style={{
              background: "var(--brand-primary)",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--brand-primary)"; }}
          >
             Hablar con soporte
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AdminHelpCenterPage ───────────────────────────────────────────────────────

export default function AdminHelpCenterPage() {
  const { adminPath } = useRestaurant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    () => searchParams.get("article")
  );

  // Sync article param from URL
  useEffect(() => {
    const id = searchParams.get("article");
    if (id) setSelectedArticleId(id);
  }, [searchParams]);

  const openArticle = (id: string) => {
    setSelectedArticleId(id);
    setSearchParams({ article: id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setSelectedArticleId(null);
    setSearchParams({});
    setSearch("");
  };

  const popularArticles = POPULAR_IDS
    .map((id) => HELP_ARTICLES.find((a) => a.id === id))
    .filter(Boolean) as HelpArticle[];

  const categoryCounts = Object.fromEntries(
    HELP_CATEGORIES.map((c) => [
      c.id,
      HELP_ARTICLES.filter((a) => a.category === c.id).length,
    ])
  );

  const filteredArticles = search.trim()
    ? HELP_ARTICLES.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase()) ||
          a.tags.some((t) => t.includes(search.toLowerCase())) ||
          a.content.toLowerCase().includes(search.toLowerCase())
      )
    : selectedCategory
      ? HELP_ARTICLES.filter((a) => a.category === selectedCategory)
      : HELP_ARTICLES;

  const selectedArticle = selectedArticleId
    ? HELP_ARTICLES.find((a) => a.id === selectedArticleId)
    : null;

  const openChat = () => {
    window.dispatchEvent(new CustomEvent("open-support-chat"));
  };

  return (
    <>
      <style>{`
        .help-article-content {
          font-size: 14px;
          line-height: 1.7;
          color: var(--admin-text-primary, #111827);
        }
        .help-article-content h1 {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 16px;
          color: var(--admin-text-primary);
        }
        .help-article-content h2 {
          font-size: 16px;
          font-weight: 700;
          margin: 24px 0 10px;
          color: var(--admin-text-primary);
          padding-bottom: 6px;
          border-bottom: 1px solid var(--admin-card-border, #e5e7eb);
        }
        .help-article-content h3 {
          font-size: 14px;
          font-weight: 700;
          margin: 16px 0 8px;
          color: var(--admin-text-primary);
        }
        .help-article-content p {
          margin: 0 0 12px;
        }
        .help-article-content ul, .help-article-content ol {
          margin: 0 0 12px;
          padding-left: 20px;
        }
        .help-article-content li {
          margin-bottom: 4px;
        }
        .help-article-content strong {
          font-weight: 700;
          color: var(--admin-text-primary);
        }
        .help-article-content code {
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          font-family: monospace;
        }
        .help-article-content pre {
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px 16px;
          overflow-x: auto;
          margin: 0 0 12px;
        }
        .help-article-content pre code {
          background: none;
          border: none;
          padding: 0;
          font-size: 13px;
        }
        .help-article-content blockquote {
          border-left: 3px solid var(--brand-primary);
          padding-left: 12px;
          margin: 12px 0;
          color: var(--admin-text-secondary);
          font-style: italic;
        }
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* ── Article detail view ── */}
        {selectedArticle ? (
          <ArticleDetail
            article={selectedArticle}
            onBack={goBack}
            onOpenChat={openChat}
            onArticleClick={openArticle}
          />
        ) : (
          <>
            {/* ── Header ── */}
            <div style={{ marginBottom: 24 }}>
              <h1
                className="admin-panel"
                style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}
              >
                Centro de ayuda
              </h1>
              <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", margin: 0 }}>
                Encuentra respuestas a tus preguntas sobre el panel
              </p>
            </div>

            {/* ── Search bar ── */}
            <div style={{ position: "relative", marginBottom: 24 }}>
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 16,
                  color: "#9ca3af",
                  pointerEvents: "none",
                }}
              >
                
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedCategory(null);
                }}
                placeholder="Busca tu pregunta..."
                style={{
                  width: "100%",
                  border: "1.5px solid var(--admin-card-border, #e5e7eb)",
                  borderRadius: "var(--admin-radius-md, 12px)",
                  padding: "12px 14px 12px 44px",
                  fontSize: 15,
                  outline: "none",
                  background: "#fff",
                  color: "var(--admin-text-primary)",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--brand-primary)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--brand-primary-soft)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-card-border, #e5e7eb)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 18,
                    color: "#9ca3af",
                    lineHeight: "1",
                    padding: "2px",
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {!search && (
              <>
                {/* ── Popular articles ── */}
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
                    Artículos populares
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {popularArticles.map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        onClick={() => openArticle(article.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* ── Category grid ── */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                      Explorar por categoría
                    </h2>
                    {selectedCategory && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--brand-hover)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Ver todas ×
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {HELP_CATEGORIES.map((cat) => (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        count={categoryCounts[cat.id] ?? 0}
                        active={selectedCategory === cat.id}
                        onClick={() =>
                          setSelectedCategory((prev) =>
                            prev === cat.id ? null : cat.id
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Articles list ── */}
            <div>
              {(search || selectedCategory) && (
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
                  {search
                    ? `Resultados para "${search}" (${filteredArticles.length})`
                    : `${HELP_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? ""} (${filteredArticles.length})`}
                </h2>
              )}

              {filteredArticles.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    background: "#fff",
                    borderRadius: "var(--admin-radius-lg, 16px)",
                    border: "1px solid var(--admin-card-border, #e5e7eb)",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}></div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text-primary)", marginBottom: 6 }}>
                    No encontramos resultados
                  </div>
                  <div style={{ fontSize: 13, color: "var(--admin-text-secondary)", marginBottom: 16 }}>
                    Prueba con otras palabras o contacta con soporte
                  </div>
                  <button
                    type="button"
                    onClick={openChat}
                    style={{
                      background: "var(--brand-primary)",
                      border: "none",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                     Preguntar al asistente
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      onClick={() => openArticle(article.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Still need help? ── */}
            {!search && !selectedCategory && (
              <div
                style={{
                  marginTop: 28,
                  background: "var(--brand-primary-soft)",
                  border: "1px solid var(--brand-primary-border)",
                  borderRadius: "var(--admin-radius-lg, 16px)",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-text-primary)", marginBottom: 4 }}>
                    ¿No encuentras lo que buscas?
                  </div>
                  <div style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                    Nuestro asistente puede ayudarte con cualquier duda
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={openChat}
                    style={{
                      background: "var(--brand-primary)",
                      border: "none",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--brand-primary)"; }}
                  >
                     Hablar con asistente
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`${adminPath}/support`)}
                    style={{
                      background: "#fff",
                      border: "1px solid var(--brand-primary-border)",
                      color: "var(--brand-hover)",
                      borderRadius: 8,
                      padding: "9px 18px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-primary-soft)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                     Abrir ticket
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
