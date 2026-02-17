import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { FlagDashErrorBoundary } from '../error-boundary';

// Component that throws
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return createElement('div', null, 'No error');
}

// Suppress React error boundary console errors in tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

describe('FlagDashErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      createElement(
        FlagDashErrorBoundary,
        { fallback: createElement('div', null, 'Error occurred') },
        createElement(ThrowingComponent, { shouldThrow: false })
      )
    );

    expect(getByText('No error')).toBeDefined();
  });

  it('renders fallback ReactNode on error', () => {
    const { getByText } = render(
      createElement(
        FlagDashErrorBoundary,
        { fallback: createElement('div', null, 'Error occurred') },
        createElement(ThrowingComponent, { shouldThrow: true })
      )
    );

    expect(getByText('Error occurred')).toBeDefined();
  });

  it('renders fallback function on error', () => {
    const { getByText } = render(
      createElement(
        FlagDashErrorBoundary,
        {
          fallback: (error: Error, _reset: () => void) =>
            createElement('div', null, `Caught: ${error.message}`),
        },
        createElement(ThrowingComponent, { shouldThrow: true })
      )
    );

    expect(getByText('Caught: Test error')).toBeDefined();
  });

  it('calls onError callback', () => {
    const onError = vi.fn();

    render(
      createElement(
        FlagDashErrorBoundary,
        { onError, fallback: createElement('div', null, 'Error') },
        createElement(ThrowingComponent, { shouldThrow: true })
      )
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('Test error');
  });

  it('reset function re-renders children', () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error('Boom');
      return createElement('div', null, 'Recovered');
    }

    const { getByText } = render(
      createElement(
        FlagDashErrorBoundary,
        {
          fallback: (error: Error, reset: () => void) =>
            createElement(
              'div',
              null,
              createElement('span', null, error.message),
              createElement('button', { onClick: () => { shouldThrow = false; reset(); } }, 'Retry')
            ),
        },
        createElement(MaybeThrow)
      )
    );

    expect(getByText('Boom')).toBeDefined();

    fireEvent.click(getByText('Retry'));

    expect(getByText('Recovered')).toBeDefined();
  });
});
