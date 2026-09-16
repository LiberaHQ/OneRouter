export function NotFoundBody() {
  return (
    <main className="page narrow">
      <section className="page-head" style={{ paddingTop: 110 }}>
        <span className="kicker">404</span>
        <h1>No route for that.</h1>
        <p className="sub">
          The page is not here. If you followed an error message, the code itself is the anchor — try the
          errors page.
        </p>
        <div className="hero-cta">
          <a className="btn primary lg" href="/docs/quickstart">
            Quickstart
          </a>
          <a className="btn lg" href="/docs/errors">
            Errors
          </a>
          <a className="btn lg" href="/models">
            Models
          </a>
        </div>
      </section>
    </main>
  );
}
