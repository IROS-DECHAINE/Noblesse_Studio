export const capabilityForSurface = (surface) => surface?.installCapability || 'material'

export const projectSupportsSurface = (project, surface) => {
  const capability = capabilityForSurface(surface)
  return Boolean(
    project?.canInstall
    && (project.transferReady ?? project.connected)
    && (!surface?.platforms?.length || surface.platforms.includes(project.platform))
    && project.installCapabilities?.[capability] === true,
  )
}
