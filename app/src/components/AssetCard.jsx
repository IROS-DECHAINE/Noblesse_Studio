import { Check, GitFork } from 'lucide-react'
import { formatAssetName, textureRole, thumbnailFor } from '../lib/catalog.js'

export default function AssetCard({ asset, selected, onSelect, compact = false }) {
  return (
    <button
      className={`asset-card ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}
      onClick={() => onSelect(asset)}
      type="button"
      title={asset.display_name}
    >
      <span className="asset-image-wrap">
        <img src={thumbnailFor(asset)} alt="" loading="lazy" />
        {selected && <span className="selected-check"><Check size={13} /></span>}
        {textureRole(asset.display_name) && <span className="map-role">{textureRole(asset.display_name)}</span>}
      </span>
      <span className="asset-card-copy">
        <strong>{formatAssetName(asset.display_name)}</strong>
        <small>{asset.asset_type}</small>
      </span>
      {asset.asset_type === 'Material' && <GitFork className="asset-kind-icon" size={15} />}
    </button>
  )
}
