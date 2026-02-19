// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useIntake } from './useIntake'
import { PLATFORMS } from '../../platforms/index'
import './intake.css'

export function IntakeForm({ onCreated, onDuplicate, isBusy }) {
  const prefersReducedMotion = useReducedMotion()
  const {
    postUrl,
    setPostUrl,
    postUrlInputRef,
    isSubmitting,
    submitError,
    platformCapabilities,
    isUpdatingCapabilities,
    capabilitiesNote,
    isIntakeSuccessPulse,
    intakeState,
    hasReadyUrl,
    handleSubmit,
    handlePasteAndGo,
    handleTogglePlatform,
    duplicateActiveJob,
    handleViewExistingJob,
  } = useIntake({ onCreated, onDuplicate })

  return (
    <motion.section
      className={`card vault-experience${isIntakeSuccessPulse ? ' is-pulsing' : ''}`}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2>Media Vault</h2>
      <form className="vault-form" onSubmit={handleSubmit}>
        <motion.div
          className={`vault-input-shell${hasReadyUrl ? ' is-ready' : ''}${
            intakeState.state === 'invalid' ? ' is-invalid' : ''
          }`}
          animate={
            prefersReducedMotion
              ? undefined
              : intakeState.state === 'ready'
              ? { scale: [1, 1.004, 1] }
              : intakeState.state === 'invalid'
              ? { x: [0, -2, 2, -1, 0] }
              : { scale: 1 }
          }
          transition={
            prefersReducedMotion
              ? undefined
              : intakeState.state === 'invalid'
              ? { duration: 0.24, ease: 'easeInOut' }
              : { duration: 0.35, ease: 'easeOut' }
          }
        >
          <label htmlFor="postUrl" className="sr-only">
            Media URL
          </label>
          <input
            id="postUrl"
            ref={postUrlInputRef}
            className="vault-input"
            name="postUrl"
            type="url"
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
            aria-label="Media URL"
            placeholder={`Drop a ${PLATFORMS.map((p) => p.label).join(' or ')} URL...`}
            required
          />
          <motion.button
            type="button"
            className={`vault-paste-btn${isSubmitting ? ' is-loading' : ''}`}
            onClick={handlePasteAndGo}
            disabled={isSubmitting || isBusy || isUpdatingCapabilities}
            title="Paste & Go"
            aria-label="Paste & Go"
            whileHover={prefersReducedMotion ? undefined : { y: -1.5, scale: 1.012 }}
            whileTap={prefersReducedMotion ? undefined : { y: 0.5, scale: 0.986 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.8 }}
          >
            <span className="vault-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M9 4h9a2 2 0 0 1 2 2v9" />
                <path d="M7 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
              </svg>
            </span>
            <span className="vault-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </span>
          </motion.button>
        </motion.div>

        <div className="vault-chip-row" aria-label="Source availability">
          {PLATFORMS.map((platform) => {
            const enabled = platformCapabilities[platform.id] === true
            return (
              <motion.button
                key={platform.id}
                type="button"
                className={`vault-chip ${enabled ? 'is-enabled' : 'is-disabled'}`}
                title={enabled ? `${platform.label} downloads enabled. Click to disable.` : `${platform.label} downloads disabled. Click to enable.`}
                onClick={() => handleTogglePlatform(platform.id)}
                disabled={isUpdatingCapabilities || isSubmitting || isBusy}
                whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                whileTap={prefersReducedMotion ? undefined : { y: 0.5, scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.72 }}
              >
                {enabled ? `${platform.label} enabled` : `${platform.label} disabled`}
              </motion.button>
            )
          })}
          <span className="vault-chip is-neutral" title="Clipboard paste available">
            Clipboard ready
          </span>
        </div>

        <AnimatePresence mode="wait">
          {capabilitiesNote && (
            <motion.p
              key="capability-note"
              className="vault-note"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -2 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {capabilitiesNote}
            </motion.p>
          )}
        </AnimatePresence>

        {submitError && (
          <div className="vault-submit-feedback">
            <p className="error">{submitError}</p>
            {duplicateActiveJob && (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleViewExistingJob}
                disabled={isSubmitting || isBusy || isUpdatingCapabilities}
              >
                View existing job
              </button>
            )}
          </div>
        )}
      </form>
    </motion.section>
  )
}
