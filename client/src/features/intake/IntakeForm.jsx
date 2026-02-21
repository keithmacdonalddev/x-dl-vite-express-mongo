// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useIntake } from './useIntake'
import { useAuthStatus } from '../../hooks/useAuthStatus'
import { PLATFORMS } from '../../platforms/index'
import './intake.css'

export function IntakeForm({ onCreated, onDuplicate, isBusy, compact = false }) {
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

  const {
    authStatus,
    isConnecting,
    authError,
    connectPlatform,
    disconnectPlatform,
  } = useAuthStatus()

  return (
    <motion.section
      className={`${compact ? 'vault-experience vault-experience-compact' : 'card vault-experience'}${isIntakeSuccessPulse ? ' is-pulsing' : ''}`}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {!compact && <h2>Media Vault</h2>}
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

        {!compact && (
          <div className="vault-chip-row" aria-label="Source availability">
            {PLATFORMS.map((platform) => {
              const enabled = platformCapabilities[platform.id] === true
              const auth = authStatus[platform.id] || {}
              const isThisConnecting = isConnecting === platform.id

              return (
                <div key={platform.id} className="vault-platform-group">
                  <motion.button
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

                  {enabled && (
                    <button
                      type="button"
                      className={`vault-auth-chip ${auth.connected ? 'is-connected' : 'is-disconnected'}${isThisConnecting ? ' is-connecting' : ''}`}
                      onClick={() => auth.connected ? disconnectPlatform(platform.id) : connectPlatform(platform.id)}
                      disabled={isThisConnecting || isSubmitting || isBusy}
                      title={
                        auth.connected
                          ? `${platform.label} session active. Click to disconnect.`
                          : isThisConnecting
                          ? `Waiting for ${platform.label} login...`
                          : `Connect ${platform.label} account`
                      }
                    >
                      <span className={`auth-dot ${auth.connected ? 'is-active' : ''}`} aria-hidden="true" />
                      <span>
                        {auth.connected
                          ? 'Connected'
                          : isThisConnecting
                          ? 'Waiting for login...'
                          : 'Connect'}
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
            <span className="vault-chip is-neutral" title="Clipboard paste available">
              Clipboard ready
            </span>
          </div>
        )}

        {!compact && (
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
        )}

        {(submitError || authError) && (
          <div className="vault-submit-feedback">
            {submitError && <p className="error">{submitError}</p>}
            {authError && <p className="error">{authError}</p>}
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
