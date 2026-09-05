export function formatTranslation(pattern: string, locale: string, variables: Record<string, unknown> = {}): string {
  let output = pattern;
  const complex = /\{([\w.]+),\s*(plural|selectordinal|select),\s*((?:[^{}]|\{[^{}]*\})*)\}/g;
  output = output.replace(complex, (_match, name: string, type: string, branches: string) => {
    const choices: Record<string, string> = {};
    for (const branch of branches.matchAll(/(=?[\w-]+)\s*\{([^{}]*)\}/g)) choices[branch[1]] = branch[2];
    const value = variables[name];
    const number = Number(value);
    const choice = type === "select" ? String(value) : (choices[`=${number}`] !== undefined ? `=${number}` : new Intl.PluralRules(locale, { type: type === "selectordinal" ? "ordinal" : "cardinal" }).select(number));
    return (choices[choice] ?? choices.other ?? "").replace(/#/g, String(value ?? ""));
  });
  return output.replace(/\{([\w.]+)\}/g, (_match, name: string) => String(variables[name] ?? `{${name}}`));
}
