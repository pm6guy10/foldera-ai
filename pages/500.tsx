/**
 * Ensures the Pages-router 500 artifact exists during `next build` on Windows
 * (avoids ENOENT when moving `.next/export/500.html`).
 */
export default function Custom500() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07070c',
        color: '#fafafa',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <p>Something went wrong.</p>
    </div>
  );
}
