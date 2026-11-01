/**
 * MaterialsTab (admin event detail) — list with download links, multi-file
 * upload one after the other (client-side type check first), per-file error
 * messages, delete behind a ConfirmDialog, and no upload on unpublished events.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MaterialsTab from '@/app/home/admin/eventos/_components/MaterialsTab';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { MarketingPostService } from '@/app/services/core/MarketingPostService';
import en from '@/lib/i18n/locales/en.json';

jest.mock('@/app/services/core/AdminEventService', () => {
  const AdminEventService = {
    materials: jest.fn(), uploadMaterial: jest.fn(), deleteMaterial: jest.fn(), attachPostMaterial: jest.fn(),
  };
  return { __esModule: true, AdminEventService, default: AdminEventService };
});

jest.mock('@/app/services/core/MarketingPostService', () => {
  const MarketingPostService = { listPosts: jest.fn() };
  return { __esModule: true, MarketingPostService, default: MarketingPostService };
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
    expect(screen.queryByRole('button', { name: m.fromPost.open })).toBeNull();
  });

  describe('choosing a file from Posts', () => {
    const POSTS = [
      { slug: 'repaso-ip', title: 'Repaso IP Nivel 3', hasDocument: true, publishedAt: null },
      { slug: 'repaso-eda', title: 'Repaso EDA', hasDocument: true, publishedAt: null },
      { slug: 'carrusel', title: 'Un carrusel sin PDF', hasDocument: false, publishedAt: null },
    ];
    const FROM_POST = { ...FILE, id: 'm2', fileName: 'Repaso IP Nivel 3.pdf', postSlug: 'repaso-ip' };

    const openPicker = async () => {
      fireEvent.click(await screen.findByRole('button', { name: m.fromPost.open }));
    };

    beforeEach(() => {
      MarketingPostService.listPosts.mockResolvedValue({ success: true, posts: POSTS });
    });

    it('offers only presentations with a PDF, adds the chosen one and reloads', async () => {
      AdminEventService.attachPostMaterial.mockResolvedValue({ success: true, material: { id: 'm2' } });
      render(<MaterialsTab eventId="ev-1" canUpload />);
      await openPicker();

      const select = await screen.findByLabelText(m.fromPost.label);
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['repaso-ip', 'repaso-eda']);
      fireEvent.change(select, { target: { value: 'repaso-eda' } });
      fireEvent.click(screen.getByRole('button', { name: m.fromPost.confirm }));

      await waitFor(() => expect(AdminEventService.attachPostMaterial).toHaveBeenCalledWith('ev-1', 'repaso-eda'));
      expect(await screen.findByText('Repaso EDA added as material.')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(AdminEventService.materials).toHaveBeenCalledTimes(2);
    });

    it('marks the post file in the list and does not offer it again', async () => {
      AdminEventService.materials.mockResolvedValue({ success: true, materials: [FROM_POST] });
      render(<MaterialsTab eventId="ev-1" canUpload />);

      expect(await screen.findByText(m.fromPost.chip)).toBeInTheDocument();
      await openPicker();
      const select = await screen.findByLabelText(m.fromPost.label);
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['repaso-eda']);
    });

    it('deleting it says the file stays in Posts', async () => {
      AdminEventService.materials.mockResolvedValue({ success: true, materials: [FROM_POST] });
      render(<MaterialsTab eventId="ev-1" canUpload />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Repaso IP Nivel 3.pdf' }));
      expect(screen.getByText('Students will no longer see Repaso IP Nivel 3.pdf. The file stays in Posts.')).toBeInTheDocument();
    });

    it('with nothing to offer it says so and adds nothing', async () => {
      MarketingPostService.listPosts.mockResolvedValue({ success: true, posts: [POSTS[2]] });
      render(<MaterialsTab eventId="ev-1" canUpload />);
      await openPicker();

      expect(await screen.findByText(m.fromPost.empty)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: en.common.close }));
      expect(AdminEventService.attachPostMaterial).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('a failed list or a duplicate shows its error and keeps the dialog open', async () => {
      MarketingPostService.listPosts.mockResolvedValueOnce({ success: false, posts: [] });
      const { unmount } = render(<MaterialsTab eventId="ev-1" canUpload />);
      await openPicker();
      expect(await screen.findByText(m.fromPost.loadError)).toBeInTheDocument();
      unmount();

      AdminEventService.attachPostMaterial.mockResolvedValue({
        success: false, code: 'VALIDATION_ERROR', rule: 'MATERIAL_DUPLICATE', status: 400,
      });
      render(<MaterialsTab eventId="ev-1" canUpload />);
      await openPicker();
      await screen.findByLabelText(m.fromPost.label);
      fireEvent.click(screen.getByRole('button', { name: m.fromPost.confirm }));
      expect(await screen.findByText('Repaso IP Nivel 3: already in this event.')).toBeInTheDocument();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });
});
