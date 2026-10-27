// Pour `tsc` seul, qui ne lit pas les `.astro` : le barrel `index.ts` les
// réexporte. Le site consommateur les résout avec l'outillage d'Astro, qui
// type leurs props ; ce fichier n'est pas publié dans dist/.
declare module '*.astro' {
  const Component: (props: Record<string, any>) => any;
  export default Component;
}
