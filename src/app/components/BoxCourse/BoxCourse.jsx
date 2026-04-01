// src/Components/BoxCourse.js
import React from 'react';
import'./BoxCourse.css'
import { MoveRight } from 'lucide-react';

const BoxCourse = ({codigo, nombre, courseId, onCourseClick}) => {
  const handleCourseClick = () => {
    if (onCourseClick) {
      onCourseClick({ codigo, nombre, courseId });
    }
  };

  return (
    <div>
      <div className='boxCourse' onClick={handleCourseClick}>
        <div className='titulo'>
          <div className='course-header'>
            <div>
              <h2 className='h2-card'>{codigo}</h2>
              <h1 className='h1-card'>{nombre}</h1>
            </div>
          </div>
        </div>
        <div className='inferior'>
          <p className='p-card'>Encuentra tutores para esta materia</p>
          <MoveRight className='text-white flex-shrink-0' size={18} />
        </div>
      </div>
    </div>
  );
}

export default BoxCourse;
