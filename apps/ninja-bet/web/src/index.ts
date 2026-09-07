// Root has no separate landing/marketing page — the app is the app.
// Logged in goes straight to the sportsbook, logged out goes straight to
// the real registration flow (which is where the identity story actually
// happens, not a page describing it).
import { api } from './lib/api'

api
  .me()
  .then(() => {
    window.location.replace('/play.html')
  })
  .catch(() => {
    window.location.replace('/register.html')
  })
