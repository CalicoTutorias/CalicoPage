import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfilePictureViewer from '@/app/components/ProfilePictureViewer/ProfilePictureViewer';

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

const SRC = 'https://cdn.example.com/pic.jpg';

describe('ProfilePictureViewer', () => {
  it('renders children untouched when there is no picture', () => {
    render(<ProfilePictureViewer src={null}><span>AB</span></ProfilePictureViewer>);
    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the lightbox on click and closes with the close button', () => {
    render(
      <ProfilePictureViewer src={SRC} alt="Ana">
        <img src={SRC} alt="Ana" />
      </ProfilePictureViewer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.profilePicture.view' }));
    const dialog = screen.getByRole('dialog', { name: 'Ana' });
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'common.profilePicture.close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with Escape and on backdrop click', () => {
    render(<ProfilePictureViewer src={SRC} alt="Ana"><img src={SRC} alt="" /></ProfilePictureViewer>);

    fireEvent.click(screen.getByRole('button', { name: 'common.profilePicture.view' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.profilePicture.view' }));
    fireEvent.click(document.querySelector('.pp-lightbox__overlay'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not propagate the click to a parent card and supports as="span"', () => {
    const onParentClick = jest.fn();
    render(
      <div role="link" onClick={onParentClick}>
        <ProfilePictureViewer src={SRC} alt="Ana" as="span">
          <img src={SRC} alt="" />
        </ProfilePictureViewer>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'common.profilePicture.view' });
    expect(trigger.tagName).toBe('SPAN');

    fireEvent.click(trigger);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
