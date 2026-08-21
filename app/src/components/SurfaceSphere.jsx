export default function SurfaceSphere({ surface, large = false }) {
  return (
    <span className={`surface-sphere ${large ? 'is-large' : ''} ${surface.previewKind === 'rendered_sphere' ? 'is-rendered-sphere' : ''}`} style={{ backgroundColor: surface.previewColor }} aria-hidden="true">
      {surface.preview && <img src={surface.preview} alt="" loading="lazy" decoding="async" />}
      <span className="sphere-light" />
    </span>
  )
}
