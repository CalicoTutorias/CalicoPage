import { publicFetch } from '../authFetch';

const API_URL = '/api';

export const getMaterias = async () => {
  const { ok, data } = await publicFetch(`${API_URL}/courses`);
  if (!ok || !data) return [];
  return data;
};
