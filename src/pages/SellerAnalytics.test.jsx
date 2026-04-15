import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SellerAnalytics from './SellerAnalytics';

describe('SellerAnalytics', () => {
  it('redirects the analytics route back to the seller dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/seller/analytics']}>
        <Routes>
          <Route path="/seller/analytics" element={<SellerAnalytics />} />
          <Route path="/seller/dashboard" element={<div>Seller dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/seller dashboard/i)).toBeInTheDocument();
  });
});
