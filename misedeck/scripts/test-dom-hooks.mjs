// ESM loader hooks for the render-level suite (`npm run test:ui`, issue
// #291). tsx transforms TypeScript and JSX but has no CSS story: it hands
// a `.css` file to Node, which tries to parse it as JavaScript and dies on
// the first selector. Components import CSS modules for styling, and a
// render test needs the component, not its stylesheet — so every `.css`
// import resolves to an empty class map. Styling is not what these tests
// assert; behavior and DOM semantics are.
//
// Everything else falls through to the next hook in the chain (tsx), so
// TypeScript/JSX still get their normal transform.

const CSS_SUFFIX = /\.css$/;

export async function load(url, context, nextLoad) {
  if (!CSS_SUFFIX.test(new URL(url).pathname)) {
    return nextLoad(url, context);
  }
  return {
    format: "module",
    shortCircuit: true,
    // `styles.foo` must be a string or undefined — never a crash. A Proxy
    // that echoes the key keeps `className` readable in the DOM, which is
    // handy when a test has to distinguish two elements by look.
    source:
      "export default new Proxy({}, { get: (_target, key) => String(key) });",
  };
}
