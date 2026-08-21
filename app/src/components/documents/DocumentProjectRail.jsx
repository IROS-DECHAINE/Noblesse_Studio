import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { publicAsset } from '../../lib/desktopApi.js'

export default function DocumentProjectRail({ projects, selectedProjectId, onSelect }) {
  const railRef = useRef(null)
  const [canScrollForward, setCanScrollForward] = useState(false)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return undefined

    const update = () => {
      setCanScrollForward(rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 2)
    }

    update()
    rail.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    observer?.observe(rail)
    window.addEventListener('resize', update)

    return () => {
      rail.removeEventListener('scroll', update)
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [projects.length])

  const moveSelection = (event, currentIndex) => {
    const lastIndex = projects.length - 1
    const destinations = {
      ArrowLeft: Math.max(0, currentIndex - 1),
      ArrowRight: Math.min(lastIndex, currentIndex + 1),
      Home: 0,
      End: lastIndex,
    }
    const nextIndex = destinations[event.key]
    if (nextIndex === undefined || nextIndex === currentIndex) return

    event.preventDefault()
    const project = projects[nextIndex]
    onSelect(project.id)
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`document-project-${project.id}`)
      target?.focus()
      target?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    })
  }

  const scrollForward = () => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({
      left: Math.max(260, rail.clientWidth * 0.72),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="documents-project-rail-shell">
      <div className="documents-project-rail" ref={railRef} role="tablist" aria-label="Choisir le studio ou le jeu">
        {projects.map((project, index) => {
          const selected = project.id === selectedProjectId
          return (
            <button
              className={`document-project-card is-${project.tone} ${selected ? 'is-selected' : ''}`}
              id={`document-project-${project.id}`}
              key={project.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="document-library-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(project.id)}
              onKeyDown={(event) => moveSelection(event, index)}
            >
              <span className="document-project-card__media">
                <img
                  className="document-project-card__image"
                  src={publicAsset(project.imagePath)}
                  alt=""
                  draggable="false"
                />
              </span>
              <span className="document-project-card__label">{project.label}</span>
            </button>
          )
        })}
      </div>
      <button
        className="documents-project-rail-next"
        type="button"
        aria-label="Afficher les destinations suivantes"
        disabled={!canScrollForward}
        onClick={scrollForward}
      >
        <ChevronRight size={25} aria-hidden="true" />
      </button>
    </div>
  )
}
