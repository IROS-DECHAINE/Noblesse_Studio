import { publicAsset } from '../lib/desktopApi.js'
import { getSkinDefinition } from '../lib/skinPreferences.js'
import SkinFluidCanvas from './SkinFluidCanvas.jsx'

export default function SkinBackdrop({ skinId, motion }) {
  const skin = getSkinDefinition(skinId)
  const backgroundSource = publicAsset(skin.asset)

  return (
    <div className="skin-backdrop" aria-hidden="true">
      <div className="skin-backdrop-layer skin-backdrop-layer-base">
        <img src={backgroundSource} alt="" draggable="false" />
      </div>
      <span className="skin-backdrop-veil" />
      <SkinFluidCanvas skinId={skinId} motion={motion} />
    </div>
  )
}
