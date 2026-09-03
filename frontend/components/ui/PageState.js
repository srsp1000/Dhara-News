const TONES = {
  empty: {
    cardBg: "var(--bg2)",
    border: "var(--border)",
    title: "var(--text1)",
    text: "var(--text2)",
    iconBg: "var(--bg3)",
  },
  error: {
    cardBg: "#fff1f2",
    border: "#fecdd3",
    title: "#9f1239",
    text: "#881337",
    iconBg: "#ffe4e6",
  },
  loading: {
    cardBg: "var(--bg2)",
    border: "var(--border)",
    title: "var(--text1)",
    text: "var(--text2)",
    iconBg: "var(--bg3)",
  },
};

export default function PageState({
  tone = "empty",
  icon = "\u2139\ufe0f",
  title,
  message,
  actionLabel,
  actionHref,
  onAction,
}) {
  const palette = TONES[tone] || TONES.empty;

  return (
    <div style={{
      border: `1px solid ${palette.border}`,
      background: palette.cardBg,
      borderRadius: 12,
      padding: "2rem 1.25rem",
      textAlign: "center",
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: palette.iconBg,
        fontSize: 22,
        marginBottom: 10,
      }}>
        {icon}
      </div>

      {title && (
        <div style={{
          fontSize: 17,
          fontWeight: 700,
          color: palette.title,
          marginBottom: 6,
          fontFamily: "'Georgia','Times New Roman',serif",
        }}>
          {title}
        </div>
      )}

      {message && (
        <div style={{
          fontSize: 13,
          color: palette.text,
          lineHeight: 1.6,
          maxWidth: 520,
          margin: "0 auto",
        }}>
          {message}
        </div>
      )}

      {actionLabel && (actionHref || onAction) && (
        <div style={{ marginTop: 14 }}>
          {actionHref ? (
            <a href={actionHref} style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 8,
              textDecoration: "none",
              border: "1px solid var(--border)",
              color: "var(--text2)",
              background: "var(--bg)",
              fontSize: 12,
              fontWeight: 600,
            }}>
              {actionLabel}
            </a>
          ) : (
            <button onClick={onAction} style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}>
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
