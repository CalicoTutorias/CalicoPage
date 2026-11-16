/**
 * SessionMaterials: what each person sees of a session's material. A locked
 * student only learns how many files there are and what unlocks them; the tutor
 * and admins upload and remove.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionMaterials from '@/app/components/SessionMaterials/SessionMaterials';
import { SessionMaterialService } from '@/app/services/core/SessionMaterialService';

jest.mock('@/lib/i18n', () => {
  const en = require('@/lib/i18n/locales/en.json');
  const get = (path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), en) ?? path;
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), get(key));
  const value = { t, locale: 'en' };
  return { useI18n: () => value };
});

jest.mock('@/app/services/core/SessionMaterialService', () => ({
  __esModule: true,
  SessionMaterialService: { list: jest.fn(), upload: jest.fn(), remove: jest.fn(), getDownloadUrl: jest.fn() },
}));

const FILE = { id: 'm1', fileName: 'Guia.pdf', mimeType: 'application/pdf', fileSize: 2048, createdAt: '2026-11-03T12:00:00.000Z' };
const managed = (overrides = {}) => ({ ...FILE, uploadedByTutor: true, canDelete: true, ...overrides });

function managerView(materials = [managed()], overrides = {}) {
  return { success: true, canManage: true, canUpload: true, locked: false, lockReason: null, count: materials.length, materials, ...overrides };
}

function studentView(overrides = {}) {
  return { success: true, canManage: false, canUpload: false, locked: false, lockReason: null, count: 1, materials: [FILE], ...overrides };
}

const lockedView = (lockReason, count = 2) => studentView({ locked: true, lockReason, count, materials: [] });
const uploadInput = () => document.querySelector('input[type="file"]');
const pdf = (name = 'Taller.pdf', size = 1) => {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  jest.clearAllMocks();
  SessionMaterialService.list.mockResolvedValue(managerView());
  SessionMaterialService.upload.mockResolvedValue({ success: true, material: managed() });
  SessionMaterialService.remove.mockResolvedValue({ success: true });
  SessionMaterialService.getDownloadUrl.mockResolvedValue({ success: true, url: 'https://s3.example/get', fileName: 'Guia.pdf' });
});

describe('student', () => {
  it('test_should_say_how_many_files_there_are_and_what_unlocks_them', async () => {
    SessionMaterialService.list.mockResolvedValue(lockedView('REVIEW_REQUIRED'));
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText(/There are 2 material files. Leave your review with a comment/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
  });

  it('test_should_use_the_singular_for_one_file', async () => {
    SessionMaterialService.list.mockResolvedValue(lockedView('REVIEW_REQUIRED', 1));
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText(/There is 1 material file/)).toBeInTheDocument();
  });

  it('test_should_ask_for_the_comment_when_the_review_has_none', async () => {
    SessionMaterialService.list.mockResolvedValue(lockedView('COMMENT_REQUIRED'));
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText(/Your review has no comment/)).toBeInTheDocument();
  });

  it('test_should_offer_only_the_download_once_unlocked', async () => {
    SessionMaterialService.list.mockResolvedValue(studentView());
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByRole('button', { name: 'Download Guia.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Guia.pdf' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload material' })).toBeNull();
    expect(screen.queryByText(/Uploaded by/)).toBeNull();
  });

  it('test_should_show_nothing_when_there_is_no_material', async () => {
    SessionMaterialService.list.mockResolvedValue(studentView({ count: 0, materials: [] }));
    const { container } = render(<SessionMaterials sessionId="s1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('test_should_ask_for_a_fresh_url_when_downloading', async () => {
    SessionMaterialService.list.mockResolvedValue(studentView());
    SessionMaterialService.getDownloadUrl.mockResolvedValue({ success: false, status: 403, error: 'MATERIALS_LOCKED' });
    render(<SessionMaterials sessionId="s1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download Guia.pdf' }));

    await waitFor(() => expect(SessionMaterialService.getDownloadUrl).toHaveBeenCalledWith('s1', 'm1'));
    expect(await screen.findByText(/Leave your review with a comment to download this material/)).toBeInTheDocument();
  });
});

describe('someone outside the session', () => {
  it.each([[403], [404]])('test_should_show_nothing_on_a_%i', async (status) => {
    SessionMaterialService.list.mockResolvedValue({ success: false, status });
    const { container } = render(<SessionMaterials sessionId="s1" />);

    await waitFor(() => expect(SessionMaterialService.list).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('tutor or admin', () => {
  it('test_should_explain_when_the_student_gets_it_and_say_when_there_is_nothing', async () => {
    SessionMaterialService.list.mockResolvedValue(managerView([]));
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText(/once they leave their review with a comment/)).toBeInTheDocument();
    expect(screen.getByText('There is no material in this session yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload material' })).toBeInTheDocument();
  });

  it('test_should_say_who_left_each_file', async () => {
    SessionMaterialService.list.mockResolvedValue(managerView([managed(), managed({ id: 'm2', fileName: 'Otro.pdf', uploadedByTutor: false })]));
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText(/Uploaded by the tutor/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Calico/)).toBeInTheDocument();
  });

  it('test_should_not_offer_to_remove_a_file_the_server_does_not_allow', async () => {
    SessionMaterialService.list.mockResolvedValue(managerView([managed({ canDelete: false })]));
    render(<SessionMaterials sessionId="s1" />);

    await screen.findByRole('button', { name: 'Download Guia.pdf' });
    expect(screen.queryByRole('button', { name: 'Delete Guia.pdf' })).toBeNull();
  });

  it('test_should_not_offer_the_upload_on_a_canceled_session', async () => {
    SessionMaterialService.list.mockResolvedValue(managerView([managed()], { canUpload: false }));
    render(<SessionMaterials sessionId="s1" />);

    await screen.findByRole('button', { name: 'Download Guia.pdf' });
    expect(screen.queryByRole('button', { name: 'Upload material' })).toBeNull();
  });

  it('test_should_upload_every_file_and_refresh_the_list_and_the_count', async () => {
    const onCountChange = jest.fn();
    render(<SessionMaterials sessionId="s1" onCountChange={onCountChange} />);
    await screen.findByRole('button', { name: 'Upload material' });
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));

    SessionMaterialService.list.mockResolvedValue(managerView([managed(), managed({ id: 'm2' }), managed({ id: 'm3' })]));
    const [first, second] = [pdf('a.pdf'), pdf('b.pdf')];
    fireEvent.change(uploadInput(), { target: { files: [first, second] } });

    await waitFor(() => expect(SessionMaterialService.upload).toHaveBeenCalledTimes(2));
    expect(SessionMaterialService.upload).toHaveBeenCalledWith('s1', first);
    expect(SessionMaterialService.upload).toHaveBeenCalledWith('s1', second);
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(3));
  });

  it('test_should_refuse_a_type_that_is_not_allowed_without_uploading', async () => {
    render(<SessionMaterials sessionId="s1" />);
    await screen.findByRole('button', { name: 'Upload material' });

    fireEvent.change(uploadInput(), { target: { files: [pdf('virus.exe')] } });

    expect(await screen.findByText(/virus.exe: This file type is not allowed/)).toBeInTheDocument();
    expect(SessionMaterialService.upload).not.toHaveBeenCalled();
  });

  it('test_should_refuse_a_file_over_the_limit_without_uploading', async () => {
    render(<SessionMaterials sessionId="s1" />);
    await screen.findByRole('button', { name: 'Upload material' });

    fireEvent.change(uploadInput(), { target: { files: [pdf('grande.pdf', 100 * 1024 * 1024 + 1)] } });

    expect(await screen.findByText(/grande.pdf: The file cannot be larger than 100 MB/)).toBeInTheDocument();
    expect(SessionMaterialService.upload).not.toHaveBeenCalled();
  });

  it('test_should_stop_at_the_first_failed_upload_and_explain_it', async () => {
    SessionMaterialService.upload.mockResolvedValue({ success: false, error: 'UPLOAD_FAILED' });
    render(<SessionMaterials sessionId="s1" />);
    await screen.findByRole('button', { name: 'Upload material' });

    fireEvent.change(uploadInput(), { target: { files: [pdf('a.pdf'), pdf('b.pdf')] } });

    expect(await screen.findByText(/a.pdf: The file upload failed/)).toBeInTheDocument();
    expect(SessionMaterialService.upload).toHaveBeenCalledTimes(1);
  });

  it('test_should_remove_a_file_after_confirming', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SessionMaterials sessionId="s1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Guia.pdf' }));

    await waitFor(() => expect(SessionMaterialService.remove).toHaveBeenCalledWith('s1', 'm1'));
    await waitFor(() => expect(SessionMaterialService.list).toHaveBeenCalledTimes(2));
    confirm.mockRestore();
  });

  it('test_should_keep_the_file_when_the_confirmation_is_declined', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SessionMaterials sessionId="s1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Guia.pdf' }));

    expect(SessionMaterialService.remove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe('failures', () => {
  it('test_should_say_so_when_the_list_cannot_be_loaded', async () => {
    SessionMaterialService.list.mockResolvedValue({ success: false, status: 500 });
    render(<SessionMaterials sessionId="s1" />);

    expect(await screen.findByText('Could not load the material.')).toBeInTheDocument();
  });

  it('test_should_show_the_rate_limit_message_on_a_429', async () => {
    SessionMaterialService.getDownloadUrl.mockResolvedValue({ success: false, status: 429 });
    render(<SessionMaterials sessionId="s1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download Guia.pdf' }));

    expect(await screen.findByText(/Too many requests in a row/)).toBeInTheDocument();
  });
});
