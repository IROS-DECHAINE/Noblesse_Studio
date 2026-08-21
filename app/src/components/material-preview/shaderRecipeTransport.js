export function shaderRecipeCompilerInput(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return graph
  const graphDescriptors = Object.getOwnPropertyDescriptors(graph)
  if (Object.getPrototypeOf(graph) !== Object.prototype
    || Object.values(graphDescriptors).some((descriptor) => !Object.hasOwn(descriptor, 'value'))
    || !Array.isArray(graphDescriptors.textures?.value)) return graph
  return Object.fromEntries(Object.entries(graphDescriptors).map(([key, descriptor]) => [
    key,
    key === 'textures' ? descriptor.value.map((texture) => {
      if (!texture || typeof texture !== 'object' || Array.isArray(texture)) return texture
      const descriptors = Object.getOwnPropertyDescriptors(texture)
      if (Object.getPrototypeOf(texture) !== Object.prototype
        || Object.values(descriptors).some((entry) => !Object.hasOwn(entry, 'value'))) return texture
      return Object.fromEntries(Object.entries(descriptors)
        .filter(([entryKey]) => entryKey !== 'url')
        .map(([entryKey, entryDescriptor]) => [entryKey, entryDescriptor.value]))
    }) : descriptor.value,
  ]))
}
