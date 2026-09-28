import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCatalog } from '../../shared/admin'
import { AdminApiError } from './adminApi'
import { useAdminAuth } from './adminStore'
import { useAdminCatalog } from './catalogStore'
import { BulkPricingPage } from './BulkPricingPage'
import { CatalogPage } from './CatalogPage'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  catalog: vi.fn(),
  updateProduct: vi.fn(),
  updateSize: vi.fn(),
  bulkUpdatePrices: vi.fn(),
}))
vi.mock('./adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adminApi')>()
  return { ...actual, adminApi: mocks }
})

function makeCatalog(): AdminCatalog {
  const size = (id: string, priceMinor: number, active = true) => ({ id, width: 8, height: 10, unit: 'in' as const, displayLabel: `${id} in`, priceMinor, glassSurchargeMinor: 0, matSurchargeMinor: 0, active, rowVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' })
  return {
    version: 'v1',
    currency: 'INR',
    glassOptions: [{ id: 'standard', name: 'Standard', description: '', priced: false }],
    matOptions: [{ id: 'none', name: 'No mat', description: '', hasMat: false }],
    delivery: { flatFeeMinor: 14900, freeAboveMinor: null, note: '' },
    products: [
      {
        id: 'walnut',
        name: 'Classic Walnut',
        tagline: 't',
        description: 'd',
        styleId: 'walnut',
        active: true,
        shipsWithMat: true,
        sizes: [size('8x10', 49900), size('12x18', 69900)],
        glassOptionIds: ['standard'],
        matOptionIds: ['none'],
        rowVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAdminAuth.setState({ status: 'checking', user: null, error: null })
  useAdminCatalog.setState({ catalog: null, loading: false, error: null })
})

describe('LoginPage', () => {
  it('submits the typed email and password', async () => {
    mocks.login.mockResolvedValue({ user: { id: 'u', name: 'Owner', email: 'a@b.com', role: 'owner', active: true, createdAt: '', updatedAt: '', lastLoginAt: null } })
    render(<LoginPage />)
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'owner@shop.example' } })
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'a-strong-password' } })
    fireEvent.click(screen.getByTestId('login-submit'))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith('owner@shop.example', 'a-strong-password'))
  })

  it('shows the store’s error message', async () => {
    mocks.login.mockRejectedValue(new AdminApiError('UNAUTHORIZED', 401, 'no'))
    render(<LoginPage />)
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'owner@shop.example' } })
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByTestId('login-submit'))
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Incorrect email or password.')
  })
})

describe('CatalogPage', () => {
  it('lists products and searches by name', async () => {
    mocks.catalog.mockResolvedValue(makeCatalog())
    render(<CatalogPage />)
    expect(await screen.findByText('Classic Walnut')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('catalog-search'), { target: { value: 'nope' } })
    expect(screen.queryByText('Classic Walnut')).not.toBeInTheDocument()
  })

  it('deactivates a product with one click, using its current rowVersion', async () => {
    mocks.catalog.mockResolvedValue(makeCatalog())
    mocks.updateProduct.mockResolvedValue({ ...makeCatalog(), products: [{ ...makeCatalog().products[0], active: false, rowVersion: 2 }] })
    render(<CatalogPage />)
    await screen.findByText('Classic Walnut')
    fireEvent.click(screen.getByTestId('toggle-walnut'))
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledWith('walnut', { expectedVersion: 1, active: false }))
    const row = screen.getByTestId('product-row-walnut')
    expect(await within(row).findByText('Inactive')).toBeInTheDocument()
  })

  it('explains a stale-version conflict instead of pretending it worked', async () => {
    mocks.catalog.mockResolvedValue(makeCatalog())
    mocks.updateProduct.mockRejectedValue(new AdminApiError('STALE_VERSION', 409, 'stale', { currentVersion: 2 }))
    render(<CatalogPage />)
    await screen.findByText('Classic Walnut')
    fireEvent.click(screen.getByTestId('toggle-walnut'))
    expect(await screen.findByText(/changed elsewhere/)).toBeInTheDocument()
  })
})

describe('BulkPricingPage', () => {
  it('previews a percentage increase on selected rows before saving anything', async () => {
    mocks.catalog.mockResolvedValue(makeCatalog())
    render(<BulkPricingPage />)
    const row = await screen.findByTestId('bulk-row-walnut-8x10')
    fireEvent.click(within(row).getByRole('checkbox'))
    fireEvent.change(screen.getByTestId('adjustment-amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('preview-adjustment'))

    const newPriceInput = screen.getByTestId('new-price-walnut-8x10') as HTMLInputElement
    expect(newPriceInput.value).toBe('548.9') // ₹499 + 10%, to the paisa — no rounding to whole rupees
    expect(mocks.bulkUpdatePrices).not.toHaveBeenCalled() // preview only — nothing sent yet

    fireEvent.click(screen.getByTestId('review-changes'))
    expect(screen.getByTestId('review-table')).toBeInTheDocument()
  })

  it('applies only the rows that actually changed, all at once', async () => {
    mocks.catalog.mockResolvedValue(makeCatalog())
    mocks.bulkUpdatePrices.mockResolvedValue(makeCatalog())
    render(<BulkPricingPage />)
    const priceInput = await screen.findByTestId('new-price-walnut-12x18')
    fireEvent.change(priceInput, { target: { value: '750' } })
    fireEvent.click(screen.getByTestId('review-changes'))
    fireEvent.click(screen.getByTestId('apply-changes'))
    await waitFor(() =>
      expect(mocks.bulkUpdatePrices).toHaveBeenCalledWith({
        updates: [{ productId: 'walnut', sizeId: '12x18', newPriceMinor: 75000, expectedVersion: 1 }],
      }),
    )
  })
})
