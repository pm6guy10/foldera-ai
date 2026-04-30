export function requireProdProofAllowed(scriptName: string): void {
  if (process.env.ALLOW_PROD_PROOF === 'true') {
    return;
  }

  console.error(
    `[${scriptName}] Refusing to hit production without ALLOW_PROD_PROOF=true during egress emergency controls.`,
  );
  process.exit(1);
}
