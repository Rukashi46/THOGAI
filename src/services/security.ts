const CRED_KEY = 'thogai.security.biometric_cred_id'

export const security = {
  async isBiometricAvailable(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  },

  async registerBiometric(): Promise<boolean> {
    try {
      if (!window.PublicKeyCredential) return false
      const challenge = new Uint8Array(32)
      window.crypto.getRandomValues(challenge)
      const userId = new Uint8Array(16)
      window.crypto.getRandomValues(userId)

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'THOGAI Finance' },
          user: {
            id: userId,
            name: 'thogai_user',
            displayName: 'THOGAI User'
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred'
          },
          timeout: 60000
        }
      })) as PublicKeyCredential | null

      if (credential && credential.id) {
        localStorage.setItem(CRED_KEY, credential.id)
        return true
      }
      return false
    } catch (err) {
      console.warn('Biometric registration error:', err)
      return false
    }
  },

  async verifyBiometric(): Promise<boolean> {
    try {
      if (!window.PublicKeyCredential) return false
      const credId = localStorage.getItem(CRED_KEY)
      const challenge = new Uint8Array(32)
      window.crypto.getRandomValues(challenge)

      const options: CredentialRequestOptions = {
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'preferred',
          allowCredentials: credId
            ? [
                {
                  id: Uint8Array.from(atob(credId.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                  type: 'public-key'
                }
              ]
            : []
        }
      }

      const assertion = await navigator.credentials.get(options)
      return !!assertion
    } catch (err) {
      console.warn('Biometric verification error:', err)
      return false
    }
  },

  hashPin(pin: string): string {
    let hash = 0
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0
    }
    return 'pin_' + Math.abs(hash).toString(36)
  },

  verifyPin(inputPin: string, storedHash: string): boolean {
    return this.hashPin(inputPin) === storedHash
  }
}
