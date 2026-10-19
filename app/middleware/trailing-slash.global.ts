export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server && /\/_payload\.(?:json|js)$/.test(useRequestURL().pathname)) {
    return
  }

  const looksLikeFile = /\/[^/]+\.[^/]+$/.test(to.path)
  if (to.path === '/' || to.path.endsWith('/') || looksLikeFile) {
    return
  }

  return navigateTo(
    {
      path: to.path + '/',
      query: to.query,
      hash: to.hash,
    },
    {
      redirectCode: 301,
      replace: true,
    },
  )
})
