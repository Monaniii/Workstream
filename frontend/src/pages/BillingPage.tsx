import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { billingApi } from "../services"
import { CreditCard, RefreshCw, FileText } from "lucide-react"
import toast from "react-hot-toast"

export default function BillingPage() {
  const { activeWorkspace } = useAuth()
  const [plans, setPlans] = useState<any[]>([])
  const [subscription, setSubscription] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadBilling = async () => {
    setLoading(true)
    try {
      const [plansRes, subRes, invRes] = await Promise.allSettled([
        billingApi.plans(),
        billingApi.subscription(),
        billingApi.invoices(),
      ])
      if (plansRes.status === "fulfilled") setPlans(plansRes.value)
      if (subRes.status === "fulfilled") setSubscription(subRes.value)
      if (invRes.status === "fulfilled") setInvoices(invRes.value)
    } catch (err: any) {
      toast.error("Failed to load billing data")
    } finally {
      setLoading(false)
    }
  }

  const startCheckout = async (priceId: string) => {
    try {
      const data = await billingApi.createCheckout(priceId)
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to start checkout")
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      loadBilling()
    }
  }, [activeWorkspace])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Billing &amp; Subscription</h1>
          <p className="text-gray-500 text-sm">
            Manage your workspace plan, invoices, and payment details
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBilling}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Current Subscription */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold">Current Plan</h2>
            </div>
            {subscription ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Plan
                  </p>
                  <h3 className="text-xl font-bold">
                    {subscription.plan?.name || "Unknown"}
                  </h3>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Status
                  </p>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      subscription.status === "active"
                        ? "bg-green-100 text-green-700"
                        : subscription.status === "past_due"
                        ? "bg-amber-100 text-amber-700"
                        : subscription.status === "canceled"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {subscription.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Period End
                  </p>
                  <p className="text-sm text-gray-600">
                    {subscription.current_period_end
                      ? new Date(
                          subscription.current_period_end
                        ).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No active subscription found.
              </div>
            )}
          </div>

          {/* Plans */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Available Plans</h2>
              {subscription && (
                <button
                  onClick={billingApi.portal}
                  className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" /> Manage via Stripe Portal
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`border rounded-xl p-6 transition ${
                    subscription?.plan?.id === plan.id
                      ? "border-indigo-200 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    ${(plan.amount / 100).toFixed(2)}/{plan.interval}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-gray-600">
                    {(plan.features || []).map((f: string, i: number) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-green-600">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <button
                      onClick={() => startCheckout(plan.stripe_price_id)}
                      disabled={
                        !plan.stripe_price_id ||
                        subscription?.plan?.id === plan.id
                      }
                      className={`w-full py-2 rounded font-medium transition ${
                        !plan.stripe_price_id ||
                        subscription?.plan?.id === plan.id
                          ? "bg-gray-200 text-gray-500"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {subscription?.plan?.id === plan.id
                        ? "Current Plan"
                        : "Select Plan"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-6">Invoices</h2>
            {invoices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No invoices found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                        Invoice
                      </th>
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition"
                      >
                        <td className="py-3 text-sm text-gray-900">
                          {inv.stripe_invoice_id || inv.id}
                        </td>
                        <td className="py-3 text-sm text-gray-900 font-medium">
                          ${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}
                        </td>
                        <td className="py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              inv.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : inv.status === "open"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 text-sm text-gray-500">
                          {inv.created_at
                            ? new Date(inv.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
