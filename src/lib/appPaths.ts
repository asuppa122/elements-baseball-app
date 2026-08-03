export function appPath(path: string, isDemo: boolean) {
  if (!isDemo) return path
  if (path === '/') return '/demo'
  return `/demo${path}`
}
