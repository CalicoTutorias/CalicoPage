/**
 * Joint availability page — hidden behind JOINT_AVAILABILITY_ENABLED until
 * availability is computed server-side (it exposed slots already booked by
 * other students). While the flag is off the page must redirect and render
 * nothing, even with a valid `course` param.
 */

import React from 'react';
import { render } from '@testing-library/react';
import JointAvailabilityPage from '@/app/availability/joint/page';
import { JOINT_AVAILABILITY_ENABLED } from '@/lib/feature-flags';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
    useSearchParams: () => new URLSearchParams('course=MATE1203'),
}));

// The real calendar pulls in ESM-only react-calendar, which Jest can't parse.
jest.mock('@/app/components/AvailabilityCalendar/AvailabilityCalendar', () => ({
    __esModule: true,
    default: () => <div data-testid="joint-calendar" />,
}));

describe('JointAvailabilityPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('redirects to the tutor search and renders nothing while the flag is off', () => {
        expect(JOINT_AVAILABILITY_ENABLED).toBe(false);

        const { container } = render(<JointAvailabilityPage />);

        expect(mockReplace).toHaveBeenCalledWith('/home/buscar-tutores');
        expect(container).toBeEmptyDOMElement();
    });
});
