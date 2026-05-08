"use client";
import React, { useState, useEffect } from "react";

const UserContainerInfo = ({ informacion }) => {
  // Estado local para guardar el array
  const [tutores, setTutores] = useState([]);

  // useEffect para cargar/inicializar el estado
  useEffect(() => {
    if (Array.isArray(informacion)) {
      setTutores(informacion);
    }
  }, [informacion]);

  return (
    <div className="flex flex-col items-center space-y-4">
      {tutores.map((tutorItem, index) => (
        <div
          key={tutorItem.id || tutorItem.email || index}
          className="w-[1020px] border rounded-lg p-4 shadow-md flex items-center space-x-4"
        >
          <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
            <svg
              className="w-10 h-10 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
            </svg>
          </div>

          <div className="flex-1">
            <h2 className="text-xl font-semibold">{tutorItem.name}</h2>
            <p className="text-gray-500">{tutorItem.course}</p>
            <p className="text-gray-400">
              {tutorItem.sessions} Tutorías realizadas
            </p>
            <p className="text-gray-600 mt-2">{tutorItem.description}</p>
          </div>

          <div className="text-right">
            <p className="text-lg font-semibold flex items-center">
               {tutorItem.rating}{" "}
              <span className="text-gray-500 ml-2">
                {tutorItem.reviews} reviews
              </span>
            </p>
            <p className="text-xl font-bold">
              ${tutorItem.price.toLocaleString()}
            </p>
            <p className="text-gray-500 text-sm">Sesión de 1 hora</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserContainerInfo;
