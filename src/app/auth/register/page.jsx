// app/(auth)/register/page.jsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import CalicoLogo from "../../../../public/CalicoLogo.png";
import Image from "next/image";
import './register.css';
import { AuthService } from '../../services/utils/AuthService';

const Register = () => {
  const router = useRouter();
  const { refreshUserData } = useAuth();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedCareerId, setSelectedCareerId] = useState("");
  const [careers, setCareers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/majors')
      .then((r) => r.json())
      .then((data) => { if (data.success) setCareers(data.majors); })
      .catch(() => {});
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword || !selectedCareerId) {
      alert(t('auth.register.errors.allFieldsRequired'));
      return;
    }
    if (password !== confirmPassword) {
      alert(t('auth.register.errors.passwordsDontMatch'));
      return;
    }
    if (password.length < 6) {
      alert(t('auth.register.errors.weakPassword') || 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.register({
        name,
        email,
        password,
        phone: phoneNumber,
        careerId: selectedCareerId,
      });

      if (result.success) {
        if (!result.resent) await refreshUserData();
        router.push(`${routes.VERIFY_EMAIL}?email=${encodeURIComponent(email)}`);
      } else {
        throw new Error('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);

      let errorMessage = error.message || 'Error en registro';

      if (errorMessage.includes('EMAIL_EXISTS') || errorMessage.includes('email-already-in-use')) {
        errorMessage = t('auth.register.errors.emailExists') || 'Este email ya está registrado';
      } else if (errorMessage.includes('WEAK_PASSWORD') || errorMessage.includes('weak-password')) {
        errorMessage = t('auth.register.errors.weakPassword') || 'La contraseña debe tener al menos 6 caracteres';
      } else if (errorMessage.includes('invalid-email')) {
        errorMessage = t('auth.register.errors.invalidEmail') || 'El email no es válido';
      }

      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (

    <div>

    <div
        className={`relative w-full overflow-hidden PrimaryBackground min-h-screen`}
      >
        {/* Capa de degradado */}
        <div
          className="absolute w-full h-full pointer-events-none"
          style={{
            borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
            transform: "scaleX(1.5)",
            bottom: "-30%",
            left: 0,
            right: 0,
          }}
        />

      {/*Contenedor */}
      <div className='flex w-full min-h-screen z-10 items-center justify-center overflow-y-auto pb-10'>

      <div className='flex flex-col bg-white rounded-xl p-12 shadow-md w-fit h-fit justify-center items-center mt-10'>
        <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36 mb-4" priority />
        <h2 className="text-3xl font-bold mb-2 text-gray-700">{t('auth.register.title')}</h2>

        <div className='flex gap-1 mb-2'><p className='text-gray-600 text-bold'>{t('auth.register.subtitle')}</p> </div>


        <form onSubmit={handleRegister} className="flex flex-col mt-1 justify-center items-center">

        {/*Login con alguna otra cuenta */}



          {/*nombre */}
         <div className='flex flex-col gap-6 w-full md:flex-row mt-4'>
          <div className='flex flex-col w-3xs md:w-2xs'>
          <label className="mb-1 text-sm text-slate-500">{t('auth.register.name')}</label>
          <input
            type="text"
            className="mb-3 p-2 border rounded-lg placeholder:text-gray-400 text-sm"
            placeholder={t('auth.register.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/*telefono */}
          <label className="mb-1 text-sm text-slate-500">{t('auth.register.phone')}</label>
          <input
            type="text"
            className="mb-3 p-2 border rounded-lg placeholder:text-gray-400 text-sm"
            placeholder={t('auth.register.phonePlaceholder')}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />

          {/*carrera */}
          <label className="mb-1 text-sm text-slate-500">{t('auth.register.major')}</label>
          <select
            className="mb-3 p-2 border rounded-lg placeholder:text-gray-400 text-sm"
            value={selectedCareerId}
            onChange={(e) => setSelectedCareerId(e.target.value)}
          >
            <option value="">
              {t('auth.register.majorPlaceholder')}
            </option>
            {careers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          </div>

              {/*correo */}
        <div className='flex flex-col w-3xs md:w-2xs'>
        <label className="mb-1 text-sm text-slate-500">{t('auth.register.email')}</label>
        <input
          type="email"
          className="mb-3 p-2 border rounded-lg placeholder:text-gray-200 text-sm"
          placeholder={t('auth.register.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

              {/*contraseña */}
        <label className="mb-1 text-sm text-slate-500">{t('auth.register.password')}</label>
        <input
          type="password"
          className="mb-3 p-2 border rounded-lg placeholder:text-gray-400 text-sm"
          placeholder={t('auth.register.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="mb-1 text-sm text-slate-500">{t('auth.register.confirmPassword')}</label>
        <input
          type="password"
          className="mb-4 p-2 border rounded-lg placeholder:text-gray-400 text-sm"
          placeholder={t('auth.register.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        </div>
        </div>

          <button
            type="submit"
            className="SecondaryBackground text-gray-700 py-2 px-4 rounded-lg w-1/2 md:w-50 mt-4"
          >
            {t('auth.register.registerButton')}
          </button>
        </form>
        <div className='flex gap-1 pt-3'><p className='text-gray-500'>{t('auth.register.alreadyHaveAccount')} </p> <Link href={routes.LOGIN} className='text-orange-600 underline hover:cursor-pointer'> {t('auth.register.signIn')}</Link></div>
      </div>

      </div>


  </div>


    </div>
  );
};

export default Register;
