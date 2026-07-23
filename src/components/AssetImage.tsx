// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type ProjectAsset } from '../lib/api'

// useAssetURL loads an image asset's bytes as an object URL, revoking on unmount.
function useAssetURL(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked = false
    let objectURL = ''
    api
      .assetBlob(id)
      .then((blob) => {
        if (revoked) return
        objectURL = URL.createObjectURL(blob)
        setUrl(objectURL)
      })
      .catch(() => undefined)
    return () => {
      revoked = true
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [id])
  return url
}

// ImageTile is a clickable thumbnail for an image asset (render / preview).
export function ImageTile({ asset, onOpen }: { asset: ProjectAsset; onOpen: () => void }) {
  const url = useAssetURL(asset.id)
  return (
    <button className="tile" onClick={onOpen} title={asset.name}>
      <div className="tile-art">
        {url ? <img src={url} alt={asset.name} /> : <span className="c-faint" style={{ fontSize: 11 }}>…</span>}
      </div>
      <div className="tile-name truncate">{asset.name}</div>
    </button>
  )
}

// AssetThumb renders just the image of an asset (no tile chrome), for embedding
// in a custom tile.
export function AssetThumb({ asset }: { asset: ProjectAsset }) {
  const url = useAssetURL(asset.id)
  return url ? <img src={url} alt={asset.name} /> : <span className="c-faint" style={{ fontSize: 11 }}>…</span>
}

// ImageViewer is a full-size lightbox for an image asset.
export function ImageViewer({ asset, onClose }: { asset: ProjectAsset; onClose: () => void }) {
  const url = useAssetURL(asset.id)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 className="truncate">{asset.name}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="viewer-body">
          {!url ? <p className="c-faint" style={{ padding: 24 }}>Loading…</p> : <img src={url} alt={asset.name} />}
        </div>
      </div>
    </div>
  )
}
