/**
 * MaterialsTab (admin event detail) — list with download links, multi-file
 * upload one after the other (client-side type check first), per-file error
 * messages, delete behind a ConfirmDialog, and no upload on unpublished events.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MaterialsTab from '@/app/home/admin/eventos/_components/MaterialsTab';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = { materials: jest.fn(), uploadMaterial: jest.fn(), deleteMaterial: jest.fn() };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

const m = en.admin.events.materials;
const FILE = {
  id: 'm1', fileName: 'Guía de ejercicios.pdf', mimeType: 'application/pdf', fileSize: 2 * 1024 * 1024,
  createdAt: '2026-11-06T03:00:00.000Z', downloadUrl: 'https://s3.example/get?sig=1',
};
const fileInput = () => screen.getByLabelText(m.upload, { selector: 'input' });

beforeEach(() => {
  jest.clearAllMocks();
  AdminEventService.materials.mockResolvedValue({ success: true, materials: [FILE] });
});

describe('MaterialsTab', () => {
  it('lists each file with a download link', async () => {
    render(<MaterialsTab eventId="ev-1" canUpload />);

    expect(await screen.findByText('Guía de ejercicios.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: m.download })).toHaveAttribute('href', FILE.downloadUrl);
  });

  it('uploads the allowed files one by one, reports the rest, then reloads', async () => {
    AdminEventService.uploadMaterial
      .mockResolvedValueOnce({ success: true, material: { id: 'm2' } })
      .mockResolvedValueOnce({ success: false, code: 'VALIDATION_ERROR', rule: 'MATERIAL_LIMIT', status: 400 });
    render(<MaterialsTab eventId="ev-1" canUpload />);
    await screen.findByText('Guía de ejercicios.pdf');

    const pdf = new File(['x'], 'parcial.pdf', { type: 'application/pdf' });
    const exe = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    const py = new File(['x'], 'avl.py', { type: '' });
    fireEvent.change(fileInput(), { target: { files: [pdf, exe, py] } });

    expect(await screen.findByText('1 file uploaded.')).toBeInTheDocument();
    expect(AdminEventService.uploadMaterial).toHaveBeenCalledTimes(2);
    expect(AdminEventService.uploadMaterial).toHaveBeenNthCalledWith(1, 'ev-1', pdf);
    expect(AdminEventService.uploadMaterial).toHaveBeenNthCalledWith(2, 'ev-1', py);
    expect(screen.getByText('virus.exe: file type not allowed.')).toBeInTheDocument();
    expect(screen.getByText('This event already has the maximum of 30 files.')).toBeInTheDocument();
    expect(AdminEventService.materials).toHaveBeenCalledTimes(2);
  });

  it('delete asks first and reloads the list', async () => {
    AdminEventService.deleteMaterial.mockResolvedValue({ success: true });
    render(<MaterialsTab eventId="ev-1" canUpload />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Guía de ejercicios.pdf' }));

    expect(screen.getByText(m.deleteTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: m.deleteConfirm }));

    await waitFor(() => expect(AdminEventService.deleteMaterial).toHaveBeenCalledWith('ev-1', 'm1'));
    await waitFor(() => expect(AdminEventService.materials).toHaveBeenCalledTimes(2));
  });

  it('no upload button until the event is published', async () => {
    render(<MaterialsTab eventId="ev-1" canUpload={false} />);
    expect(await screen.findByText(m.notPublished)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: m.upload })).toBeNull();
  });
});
