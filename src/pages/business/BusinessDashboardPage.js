import React, { useMemo, useState } from "react";
import {
  Store,
  UtensilsCrossed,
  Scissors,
  ShoppingBag,
  Briefcase,
  IndianRupee,
  CalendarDays,
  Receipt,
  Package,
  Users,
  Star,
  Clock3,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  Eye,
  Percent,
  Wallet,
  Truck,
  MapPin,
  Sparkles,
} from "lucide-react";

const businessTypeMeta = {
  restaurant: {
    label: "Restaurant",
    icon: UtensilsCrossed,
    primaryMetricLabel: "Orders today",
    catalogLabel: "Top dishes",
    queueLabel: "Live orders",
    secondaryMetricLabel: "Avg order value",
    bookingsLabel: "Reservations",
    customerLabel: "Repeat customers",
  },
  retail: {
    label: "Retail Store",
    icon: ShoppingBag,
    primaryMetricLabel: "Sales today",
    catalogLabel: "Top products",
    queueLabel: "Pending fulfilment",
    secondaryMetricLabel: "Avg basket value",
    bookingsLabel: "Store visits",
    customerLabel: "Repeat buyers",
  },
  services: {
    label: "Service Business",
    icon: Briefcase,
    primaryMetricLabel: "Jobs today",
    catalogLabel: "Top offerings",
    queueLabel: "Open jobs",
    secondaryMetricLabel: "Avg job value",
    bookingsLabel: "Scheduled visits",
    customerLabel: "Repeat clients",
  },
};

const sampleData = {
  restaurant: {
    businessName: "MyMor Demo Kitchen",
    branchName: "Melbourne Central",
    revenueToday: 18450,
    revenueChange: 12.4,
    primaryMetricValue: 128,
    primaryMetricChange: 8.1,
    avgValue: 342,
    avgValueChange: 4.3,
    bookingsCount: 27,
    bookingsChange: -2.1,
    repeatCustomers: 42,
    repeatCustomersChange: 5.2,
    conversionRate: 6.8,
    conversionChange: 1.2,
    activePromos: 4,
    pendingPayout: 9250,
    lowStockCount: 6,
    queue: [
      { id: "#ORD-2191", name: "Priya S.", type: "Delivery", time: "12 min", amount: 420, status: "preparing" },
      { id: "#ORD-2190", name: "Table 08", type: "Dine-in", time: "4 min", amount: 880, status: "accepted" },
      { id: "#ORD-2189", name: "Aarav K.", type: "Pickup", time: "Ready", amount: 250, status: "ready" },
      { id: "#ORD-2188", name: "Nina P.", type: "Delivery", time: "Delayed", amount: 610, status: "issue" },
    ],
    topCatalog: [
      { name: "Paneer Burger", value: 64, amount: 12200 },
      { name: "Loaded Fries", value: 53, amount: 6900 },
      { name: "Cold Coffee", value: 41, amount: 4510 },
      { name: "Spicy Wrap", value: 33, amount: 5940 },
    ],
    recentActivity: [
      "New 15% lunch deal activated",
      "Inventory alert on mozzarella cheese",
      "2 new reviews received",
      "Branch timings updated for Friday",
    ],
    reviews: [
      { name: "Mansi", rating: 5, text: "Fast delivery and packaging was neat." },
      { name: "Rohit", rating: 4, text: "Burger was great, fries could be hotter." },
    ],
  },
  
  retail: {
    businessName: "Campus Mart",
    branchName: "CBD Outlet",
    revenueToday: 31200,
    revenueChange: 15.1,
    primaryMetricValue: 184,
    primaryMetricChange: 11.3,
    avgValue: 495,
    avgValueChange: 2.4,
    bookingsCount: 67,
    bookingsChange: 4.7,
    repeatCustomers: 58,
    repeatCustomersChange: 6.6,
    conversionRate: 5.1,
    conversionChange: 0.5,
    activePromos: 6,
    pendingPayout: 15400,
    lowStockCount: 11,
    queue: [
      { id: "#SAL-1001", name: "Online order", type: "Delivery", time: "Packing", amount: 1240, status: "preparing" },
      { id: "#SAL-1002", name: "In-store pickup", type: "Pickup", time: "Ready", amount: 890, status: "ready" },
      { id: "#SAL-1003", name: "Online order", type: "Delivery", time: "18 min", amount: 560, status: "accepted" },
      { id: "#SAL-1004", name: "Marketplace order", type: "Delivery", time: "Issue", amount: 2100, status: "issue" },
    ],
    topCatalog: [
      { name: "Wireless Earbuds", value: 22, amount: 17600 },
      { name: "Water Bottle", value: 48, amount: 7200 },
      { name: "Backpack", value: 19, amount: 11400 },
      { name: "Desk Lamp", value: 11, amount: 4950 },
    ],
    recentActivity: [
      "New campus bundle launched",
      "Stock sync completed",
      "3 carts recovered from reminder flow",
      "Refund requested on #SAL-998",
    ],
    reviews: [
      { name: "Karan", rating: 5, text: "Quick delivery and genuine products." },
      { name: "Anita", rating: 4, text: "Nice deals but pickup queue was long." },
    ],
  },
  services: {
    businessName: "FixRight Services",
    branchName: "Inner North",
    revenueToday: 27400,
    revenueChange: 7.2,
    primaryMetricValue: 22,
    primaryMetricChange: 5.9,
    avgValue: 1340,
    avgValueChange: 3.7,
    bookingsCount: 16,
    bookingsChange: 2.8,
    repeatCustomers: 9,
    repeatCustomersChange: 4.9,
    conversionRate: 9.3,
    conversionChange: 1.1,
    activePromos: 1,
    pendingPayout: 9800,
    lowStockCount: 2,
    queue: [
      { id: "#JOB-221", name: "Plumbing visit", type: "On-site", time: "2:00 PM", amount: 1850, status: "accepted" },
      { id: "#JOB-222", name: "AC service", type: "At-home", time: "3:30 PM", amount: 2450, status: "preparing" },
      { id: "#JOB-223", name: "Electric repair", type: "On-site", time: "Completed", amount: 920, status: "ready" },
      { id: "#JOB-224", name: "Cleaning", type: "At-home", time: "Issue", amount: 1300, status: "issue" },
    ],
    topCatalog: [
      { name: "Emergency plumbing", value: 7, amount: 12950 },
      { name: "AC servicing", value: 6, amount: 8760 },
      { name: "Electrical repair", value: 5, amount: 4600 },
      { name: "Move-out cleaning", value: 4, amount: 5200 },
    ],
    recentActivity: [
      "Technician Rahul assigned to 2 jobs",
      "Service area expanded by 3 km",
      "One quote expired",
      "Customer uploaded before/after photos",
    ],
    reviews: [
      { name: "James", rating: 5, text: "Technician arrived on time and solved quickly." },
      { name: "Leah", rating: 4, text: "Good service, follow-up could be faster." },
    ],
  },
};

function currency(v) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function TrendPill({ value }) {
  const positive = Number(value) >= 0;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700"
      }`}
    >
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value)}%
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, change, sublabel }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">{value}</h3>
          {sublabel ? <p className="mt-1 text-xs text-slate-500">{sublabel}</p> : null}
        </div>
        <div className="rounded-2xl bg-slate-100 p-2.5">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </div>
      <div className="mt-4">
        <TrendPill value={change} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    accepted: { label: "Accepted", cls: "bg-sky-50 text-sky-700" },
    preparing: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
    ready: { label: "Ready", cls: "bg-emerald-50 text-emerald-700" },
    issue: { label: "Issue", cls: "bg-rose-50 text-rose-700" },
  };
  const config = map[status] || { label: status, cls: "bg-slate-100 text-slate-700" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.cls}`}>{config.label}</span>;
}

function DashboardSection({ title, subtitle, action, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function BusinessDashboard() {
  const [businessType, setBusinessType] = useState("restaurant");
  const meta = businessTypeMeta[businessType];
  const data = sampleData[businessType];
  const BusinessIcon = meta.icon;

  const summaryCards = useMemo(
    () => [
      {
        icon: IndianRupee,
        label: "Revenue today",
        value: currency(data.revenueToday),
        change: data.revenueChange,
        sublabel: "Gross sales across all channels",
      },
      {
        icon: Receipt,
        label: meta.primaryMetricLabel,
        value: data.primaryMetricValue,
        change: data.primaryMetricChange,
        sublabel: `${meta.queueLabel} + completed today`,
      },
      {
        icon: Wallet,
        label: meta.secondaryMetricLabel,
        value: currency(data.avgValue),
        change: data.avgValueChange,
        sublabel: "Compared to yesterday",
      },
      {
        icon: CalendarDays,
        label: meta.bookingsLabel,
        value: data.bookingsCount,
        change: data.bookingsChange,
        sublabel: "Including scheduled and confirmed",
      },
      {
        icon: Users,
        label: meta.customerLabel,
        value: `${data.repeatCustomers}%`,
        change: data.repeatCustomersChange,
        sublabel: "Last 30 days returning rate",
      },
      {
        icon: Eye,
        label: "Conversion rate",
        value: `${data.conversionRate}%`,
        change: data.conversionChange,
        sublabel: "From views to paid action",
      },
    ],
    [data, meta]
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-3xl bg-slate-900 p-3 text-white">
                <BusinessIcon className="h-7 w-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                    {data.businessName}
                  </h1>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {meta.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Store className="h-4 w-4" />
                    {data.branchName}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    Melbourne, Australia
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-4 w-4" />
                    Updated 2 mins ago
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Search orders, clients..."
                />
              </div>

              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="restaurant">Restaurant</option>
                <option value="retail">Retail</option>
                <option value="services">Services</option>
              </select>

              <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                <Filter className="h-4 w-4" />
                Filters
              </button>

              <button className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                <Sparkles className="h-4 w-4" />
                Quick action
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <DashboardSection
              title={meta.queueLabel}
              subtitle="Track the most urgent flow needing action right now"
              action={
                <button className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                  View all
                </button>
              }
            >
              <div className="space-y-3">
                {data.queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{item.id}</p>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{item.name} • {item.type}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5">
                        <Clock3 className="h-4 w-4" />
                        {item.time}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5">
                        <IndianRupee className="h-4 w-4" />
                        {item.amount}
                      </span>
                      <button className="rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-700">
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardSection>

            <DashboardSection
              title={meta.catalogLabel}
              subtitle="Best performers by quantity and sales value"
              action={
                <button className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                  Manage catalog
                </button>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Units</th>
                      <th className="px-4 py-3 font-medium">Revenue</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {data.topCatalog.map((item) => (
                      <tr key={item.name}>
                        <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-slate-600">{item.value}</td>
                        <td className="px-4 py-3 text-slate-600">{currency(item.amount)}</td>
                        <td className="px-4 py-3">
                          <button className="text-sm font-medium text-slate-900">View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardSection>
          </div>

          <div className="space-y-6">
            <DashboardSection title="Quick stats" subtitle="Operational health snapshot">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="inline-flex rounded-xl bg-white p-2">
                    <Percent className="h-4 w-4 text-slate-700" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Active promos</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{data.activePromos}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="inline-flex rounded-xl bg-white p-2">
                    <Wallet className="h-4 w-4 text-slate-700" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Pending payout</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{currency(data.pendingPayout)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="inline-flex rounded-xl bg-white p-2">
                    <Package className="h-4 w-4 text-slate-700" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Low stock alerts</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{data.lowStockCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="inline-flex rounded-xl bg-white p-2">
                    <Truck className="h-4 w-4 text-slate-700" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Channel status</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-700">Live</p>
                </div>
              </div>
            </DashboardSection>

            <DashboardSection title="Recent activity" subtitle="Latest admin and customer events">
              <div className="space-y-3">
                {data.recentActivity.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                    <div className="mt-0.5 rounded-full bg-white p-1.5">
                      <Bell className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </DashboardSection>

            <DashboardSection title="Latest reviews" subtitle="Customer feedback needing attention">
              <div className="space-y-3">
                {data.reviews.map((review) => (
                  <div key={review.name} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{review.name}</p>
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-sm font-medium text-slate-700">{review.rating}.0</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{review.text}</p>
                  </div>
                ))}
              </div>
            </DashboardSection>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Create promo", icon: Percent, desc: "Launch a new offer or discount" },
            { label: "Manage catalog", icon: Package, desc: "Update items, pricing, stock" },
            { label: "View customers", icon: Users, desc: "Open CRM and loyalty insights" },
            { label: "Settings", icon: MoreHorizontal, desc: "Branch, payout, staff controls" },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5"
              >
                <div className="inline-flex rounded-2xl bg-slate-100 p-2.5">
                  <Icon className="h-5 w-5 text-slate-700" />
                </div>
                <h4 className="mt-4 font-semibold text-slate-900">{action.label}</h4>
                <p className="mt-1 text-sm text-slate-500">{action.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
