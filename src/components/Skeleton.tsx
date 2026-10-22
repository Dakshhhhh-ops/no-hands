export function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={'skeleton ' + className}
      style={{
        background: 'linear-gradient(90deg, var(--va-panel-2) 25%, var(--va-panel-3) 50%, var(--va-panel-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
        borderRadius: 'var(--va-r-md)',
        ...style,
      }}
    />
  );
}

export function DiagramSkeleton() {
  return (
    <div className="va-panel-body" style={{ minHeight: '400px' }}>
      <div className="skeleton-row">
        <Skeleton style={{ height: '32px', width: '30%', marginBottom: '16px' }} />
        <Skeleton style={{ height: '16px', width: '60%' }} />
      </div>
      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} style={{ height: '120px' }} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="va-panel-body">
      <div className="skeleton-row">
        <Skeleton style={{ height: '24px', width: '25%' }} />
      </div>
      <div style={{ marginTop: '16px' }}>
        <div className="skeleton-row">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} style={{ height: '16px', width: '100%', flex: 1, marginRight: i < columns - 1 ? '16px' : 0 }} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="skeleton-row" style={{ marginTop: '12px' }}>
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton key={col} style={{ height: '16px', width: '100%', flex: 1, marginRight: col < columns - 1 ? '16px' : 0 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="va-panel-body">
      <Skeleton style={{ height: '20px', width: '40%', marginBottom: '12px' }} />
      <Skeleton style={{ height: '16px', width: '80%', marginBottom: '8px' }} />
      <Skeleton style={{ height: '16px', width: '60%' }} />
    </div>
  );
}

export function ListSkeleton({ items = 5 }) {
  return (
    <div className="va-panel-body">
      {Array.from({ length: items }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--va-line)' }}>
          <Skeleton style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ height: '16px', width: '60%', marginBottom: '4px' }} />
            <Skeleton style={{ height: '12px', width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}