export function MissingConfig({ missing, context }: { missing: string[]; context?: string }) {
  return (
    <div className="flex grow items-center justify-center p-10">
      <div className="card bg-base-100 w-full max-w-xl shadow-xl">
        <div className="card-body gap-3">
          <h2 className="card-title">Missing configuration</h2>
          <p className="text-base-content/70 text-sm">
            This page needs environment variables that are not set. Add them to <code>packages/nextjs/.env.local</code>{" "}
            and restart the dev server.
          </p>
          {context ? <p className="text-sm">{context}</p> : null}
          <ul className="mt-1 list-inside list-disc text-sm">
            {missing.map(item => (
              <li key={item}>
                <code>{item}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
