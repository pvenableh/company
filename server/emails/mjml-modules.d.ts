// Lets server code `import x from './foo.mjml'` and get the raw file contents
// as a string. The actual transform happens in nitro.rollupConfig (raw-mjml
// plugin, see nuxt.config.ts).
declare module '*.mjml' {
	const content: string;
	export default content;
}
