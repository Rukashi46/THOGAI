import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Download, CheckCircle2, ArrowDownCircle, AlertCircle, X, ExternalLink, RefreshCw } from 'lucide-react'
import { updaterService, type RemoteVersionInfo } from '../services/updater'
import { backdropVariants, desktopModalVariants, mobileSheetVariants } from '../lib/motion'

interface Props {
  info: RemoteVersionInfo
  currentVersion: string
  close: () => void
  onSuccess?: () => void
}

export function UpdateModal({ info, currentVersion, close, onSuccess }: Props) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const modalVariants = isMobile ? mobileSheetVariants : desktopModalVariants

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needPermission, setNeedPermission] = useState(false)

  const handleUpdate = async () => {
    setError(null)
    setDownloading(true)

    try {
      const canInstall = await updaterService.canRequestInstalls()
      if (!canInstall) {
        setNeedPermission(true)
        setDownloading(false)
        return
      }

      await updaterService.downloadAndInstall(info.apkUrl)
      if (onSuccess) onSuccess()
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Failed to download or launch update installer.')
      setDownloading(false)
    }
  }

  const handleGrantPermission = async () => {
    await updaterService.openInstallSettings()
    setNeedPermission(false)
  }

  return (
    <motion.div className="modal-layer" variants={backdropVariants} initial="initial" animate="animate" exit="exit" onClick={close}>
      <motion.div
        className="modal update-modal"
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="update-icon-circle">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Update Available</h2>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Current v{currentVersion} → <strong>v{info.version}</strong>
              </span>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={close} style={{ height: 32, width: 32 }}>
            <X size={17} />
          </button>
        </div>

        <div className="update-notes-card">
          <strong style={{ fontSize: 12.5, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
            What’s New in v{info.version}:
          </strong>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
            {info.releaseNotes}
          </p>
        </div>

        {needPermission && (
          <div className="update-permission-notice">
            <AlertCircle size={16} className="text-warning" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ fontSize: 12.5 }}>Permission Required</strong>
              <p style={{ margin: '2px 0 6px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.35 }}>
                Android requires enabling "Install Unknown Apps" for THOGAI to update automatically.
              </p>
              <button
                type="button"
                className="button primary compact"
                onClick={handleGrantPermission}
                style={{ fontSize: 11.5, minHeight: 28, padding: '0 12px' }}
              >
                Enable in Settings <ExternalLink size={12} />
              </button>
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: 'var(--negative)', fontSize: 12, margin: '8px 0 0' }}>
            {error}
          </p>
        )}

        <div className="update-actions" style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="button ghost"
            onClick={close}
            disabled={downloading}
            style={{ flex: 1 }}
          >
            Later
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleUpdate}
            disabled={downloading}
            style={{ flex: 1.5, gap: 6 }}
          >
            {downloading ? (
              <>
                <RefreshCw size={15} className="spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <ArrowDownCircle size={16} />
                <span>Update Now</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
