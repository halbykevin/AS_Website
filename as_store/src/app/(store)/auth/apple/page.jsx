// Where the API returns a shopper after Sign in with Apple. See TokenLanding.
import TokenLanding from '../TokenLanding.jsx'

export default function AppleAuthPage() {
  return <TokenLanding provider="apple" />
}
