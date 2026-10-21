import { lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import Account from './pages/Account'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Orders from './pages/Orders'
import Pay from './pages/Pay'
import PaymentResult from './pages/PaymentResult'
import ProductDetail from './pages/ProductDetail'
import Products from './pages/Products'
import Register from './pages/Register'
import SellerProfile from './pages/SellerProfile'
import Verification from './pages/Verification'

// Bigger, logged-in-only sections load on demand.
const SellProduct = lazy(() => import('./pages/seller/SellProduct'))
const MyListings = lazy(() => import('./pages/seller/MyListings'))
const Earnings = lazy(() => import('./pages/seller/Earnings'))
const Messages = lazy(() => import('./pages/Messages'))
const TrackerDashboard = lazy(() => import('./pages/tracker/TrackerDashboard'))
const BusinessDetail = lazy(() => import('./pages/tracker/BusinessDetail'))
const Reports = lazy(() => import('./pages/tracker/Reports'))
const Forecast = lazy(() => import('./pages/tracker/Forecast'))
const Community = lazy(() => import('./pages/Community'))

function PageSpinner() {
  return (
    <div className="grid min-h-[50svh] place-items-center">
      <span className="size-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="products" element={<Products />} />
                <Route path="products/:id" element={<ProductDetail />} />
                <Route path="sellers/:id" element={<SellerProfile />} />
                <Route path="community" element={<Community />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="account" element={<Account />} />
                  <Route path="account/verification" element={<Verification />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="pay/:reference" element={<Pay />} />
                  <Route path="payment/result" element={<PaymentResult />} />
                  <Route path="orders" element={<Orders key="buyer" as="buyer" />} />
                  <Route path="orders/received" element={<Orders key="seller" as="seller" />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="messages/:id" element={<Messages />} />

                  <Route path="sell" element={<SellProduct key="new" />} />
                  <Route path="my/listings" element={<MyListings />} />
                  <Route path="my/listings/:id/edit" element={<SellProduct key="edit" />} />
                  <Route path="my/earnings" element={<Earnings />} />

                  <Route path="tracker" element={<TrackerDashboard />} />
                  <Route path="tracker/reports" element={<Reports />} />
                  <Route path="tracker/forecast" element={<Forecast />} />
                  <Route path="tracker/:id" element={<BusinessDetail />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
          <Toaster
            position="top-center"
            toastOptions={{ style: { borderRadius: '16px', fontWeight: 600, padding: '12px 16px' } }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
