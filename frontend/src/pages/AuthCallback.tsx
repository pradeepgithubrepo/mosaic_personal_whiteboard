import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'

export const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')
      const errorDesc = searchParams.get('error_description')

      if (errorParam) {
        setError(`OAuth Error: ${errorParam}`)
        setDetails(errorDesc || 'Access denied by user.')
        setTimeout(() => navigate('/settings?auth=error', { replace: true }), 4000)
        return
      }

      if (!code) {
        setError('Invalid Callback')
        setDetails('No authorization code was found in the URL.')
        setTimeout(() => navigate('/settings', { replace: true }), 3000)
        return
      }

      setDetails('Exchanging authorization code for tokens...')
      try {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
        const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/callback`

        if (!clientId || !clientSecret) {
          throw new Error('Google OAuth credentials are not configured in environment variables.')
        }

        const params = new URLSearchParams()
        params.append('code', code)
        params.append('client_id', clientId)
        params.append('client_secret', clientSecret)
        params.append('redirect_uri', redirectUri)
        params.append('grant_type', 'authorization_code')

        // Fetch tokens via dev proxy /oauth2/token
        const tokenRes = await fetch('/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        })

        if (!tokenRes.ok) {
          const rawErr = await tokenRes.text()
          console.error('Token exchange failed:', rawErr)
          throw new Error(`Token exchange failed with status ${tokenRes.status}: ${rawErr}`)
        }

        const tokenData = await tokenRes.json()
        const { access_token, refresh_token, expires_in } = tokenData

        const expiresAt = Date.now() + (expires_in || 3600) * 1000
        localStorage.setItem('whiteboard_oauth_access_token', access_token)
        if (refresh_token) {
          localStorage.setItem('whiteboard_oauth_refresh_token', refresh_token)
        }
        localStorage.setItem('whiteboard_oauth_expires_at', expiresAt.toString())

        // Fetch user profile info
        setDetails('Retrieving user profile info...')
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        })

        if (userRes.ok) {
          const userData = await userRes.json()
          localStorage.setItem('whiteboard_oauth_user_email', userData.email || '')
          localStorage.setItem('whiteboard_oauth_user_name', userData.name || '')
          localStorage.setItem('whiteboard_oauth_user_picture', userData.picture || '')
        }

        setDetails('Successfully connected! Redirecting...')
        setTimeout(() => navigate('/settings?auth=success', { replace: true }), 1500)
      } catch (err: any) {
        console.error('OAuth Callback handling failed:', err)
        setError('Authentication Failed')
        setDetails(err.message || 'An error occurred during code-to-token exchange.')
        setTimeout(() => navigate('/settings?auth=error', { replace: true }), 5000)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="flex-1 bg-gray-50 dark:bg-[#0b0f19] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white dark:bg-[#0f172a] border border-gray-250 dark:border-gray-800 rounded-3xl p-8 shadow-sm flex flex-col items-center">
        {error ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{error}</h3>
            <p className="text-sm text-gray-550 dark:text-gray-400 mt-2 leading-relaxed">
              {details}
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Connecting Google Account</h3>
            <p className="text-sm text-gray-550 dark:text-gray-400 mt-2 leading-relaxed">
              {details}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
export default AuthCallback
