// Deliberately empty: nothing crosses the context bridge yet. The first real
// exposure will be the server lifecycle manager's connection info (port +
// token) when it lands (M1); until then the renderer talks to a manually
// started Formshift Server directly over HTTP in dev mode.
export {}
