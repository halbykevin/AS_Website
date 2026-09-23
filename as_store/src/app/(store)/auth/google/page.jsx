// Where the API returns a shopper after Google sign-in. See TokenLanding.
import TokenLanding from '../TokenLanding.jsx'

export default function GoogleAuthPage() {
  return <TokenLanding provider="google" />
}
