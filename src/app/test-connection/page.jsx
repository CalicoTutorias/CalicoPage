'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../config/api';

export default function TestConnectionPage() {
  const [status, setStatus] = useState('testing'); // testing, success, error
  const [message, setMessage] = useState('Intentando conectar con el Backend...');
  const [details, setDetails] = useState('');

  useEffect(() => {
    const checkConnection = async () => {
      try {
        // 1. Probar la raíz de la API primero (Health Check)
        const rootResponse = await fetch(`${API_URL}`);
        const rootOk = rootResponse.ok;
        let rootData = '';
        try {
            rootData = await rootResponse.text();
        } catch (e) {}

        // 2. Probar el endpoint de courses
        const coursesResponse = await fetch(`${API_URL}/courses`);
        
        if (rootOk) {
            if (coursesResponse.ok) {
                setStatus('success');
                setMessage('¡Conexión Exitosa!');
                const data = await coursesResponse.json();
                const n = data.courses?.length ?? data.count ?? 0;
                setDetails(`Backend Root: OK (${rootData})\nCourses Endpoint: OK (${n} cursos)`);
            } else {
                setStatus('warning');
                setMessage('Backend conectado, pero /courses no encontrado.');
                setDetails(`Backend Root: OK (${rootData})\nCourses Endpoint: ${coursesResponse.status} ${coursesResponse.statusText}\n\nEl backend está corriendo pero falta el endpoint /courses.`);
            }
        } else {
            setStatus('error');
            setMessage('El Backend respondió con error en la raíz.');
            setDetails(`Root Status: ${rootResponse.status} ${rootResponse.statusText}`);
        }

      } catch (error) {
        setStatus('error');
        setMessage('No se pudo conectar con el Backend.');
        setDetails(`Error: ${error.message}. \n\nAsegúrate de que:\n1. El backend está corriendo.\n2. La URL en .env.local es correcta (${API_URL}).\n3. No hay bloqueos de CORS.`);
      }
    };

    checkConnection();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">Prueba de Conexión</h1>
        
        <div className={`p-4 rounded-md mb-4 ${
          status === 'testing' ? 'bg-blue-100 text-blue-800' :
          status === 'success' ? 'bg-green-100 text-green-800' :
          status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          <p className="font-semibold">{message}</p>
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
          <p className="font-mono mb-2">Backend URL: {API_URL}</p>
          <p>{details}</p>
        </div>

        <button 
          onClick={() => window.location.reload()}
          className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
        >
          Probar de nuevo
        </button>
        
        <a href="/" className="block text-center mt-4 text-blue-600 hover:underline">
          Volver al Inicio
        </a>
      </div>
    </div>
  );
}
