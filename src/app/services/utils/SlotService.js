
export class SlotService {
  
  static generateHourlySlots(availability) {
    const slots = [];
    const startTime = new Date(availability.startDateTime);
    const endTime = new Date(availability.endDateTime);
    
    if (!(endTime > startTime)) {
      return slots;
    }

    const totalHoursFloat = (endTime - startTime) / (1000 * 60 * 60);
    const totalHours = Math.ceil(totalHoursFloat);
    
    for (let i = 0; i < totalHours; i++) {
      let slotStart = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
      let slotEnd = new Date(slotStart.getTime() + (60 * 60 * 1000));
      if (slotEnd > endTime) {
        slotEnd = new Date(endTime);
      }
      
      const slotId = `${availability.id}_slot_${i}`;
      
      const slot = {
        id: slotId,
        parentAvailabilityId: availability.id,
        slotIndex: i,
        tutorId: availability.tutorId,
        tutorEmail: availability.tutorEmail,
        title: availability.title,
        description: availability.description,
        startDateTime: slotStart,
        endDateTime: slotEnd,
        location: availability.location,
        course: availability.course || this.extractCourseFromTitle(availability.title) || 'Tutoría General',
        color: availability.color,
        googleEventId: availability.googleEventId,
        htmlLink: availability.htmlLink,
        status: availability.status,
        isBooked: false,
        bookedBy: null,
        sessionId: null,
        originalStartDateTime: availability.startDateTime,
        originalEndDateTime: availability.endDateTime,
        slotDuration: Math.max(0, (slotEnd - slotStart) / (1000 * 60 * 60)),
        recurring: availability.recurring,
        recurrenceRule: availability.recurrenceRule
      };
      
      if (slotEnd > slotStart) {
        slots.push(slot);
      }
    }
    
    return slots;
  }
  
  static generateHourlySlotsFromAvailabilities(availabilities) {
    if (!Array.isArray(availabilities)) {
      console.warn('generateHourlySlotsFromAvailabilities: availabilities no es un array válido');
      return [];
    }

    const allSlots = [];

    availabilities.forEach(availability => {
      const slots = this.generateHourlySlots(availability);
      allSlots.push(...slots);
    });

    return allSlots;
  }
  
  static applySavedBookingsToSlots(slots, bookedSlots) {
    if (!bookedSlots || bookedSlots.length === 0) {
      return slots;
    }
    
    return slots.map(slot => {
      const booking = bookedSlots.find(booking => {
        const parentMatch = booking.parentAvailabilityId === slot.parentAvailabilityId;
        const indexMatch = booking.slotIndex === slot.slotIndex;
        return parentMatch && indexMatch;
      });
      
      if (booking) {
        return {
          ...slot,
          isBooked: true,
          bookedBy: booking.studentEmail,
          sessionId: booking.sessionId,
          bookingId: booking.id,
          bookedAt: booking.bookedAt
        };
      }
      
      return slot;
    });
  }
  
  static getAvailableSlots(slots) {
    const now = new Date();
    return slots.filter(slot => {
      const slotStart = new Date(slot.startDateTime);
      const isFuture = slotStart > now;
      const isNotBooked = !slot.isBooked;
      return isFuture && isNotBooked;
    });
  }
  
  static async getAllBookingsForAvailabilities(availabilities, TutoringSessionService) {
    const allBookings = [];
    
    // Get unique tutor IDs from availabilities
    const tutorIds = [...new Set(availabilities.map(av => av.tutorId).filter(Boolean))];
    
    // Get all tutoring sessions for these tutors
    const allSessions = [];
    for (const tutorId of tutorIds) {
      try {
        const sessions = await TutoringSessionService.getTutorSessions(tutorId);
        if (Array.isArray(sessions) && sessions.length > 0) {
          // Filter sessions that are scheduled (pending, scheduled, confirmed, etc.)
          // Exclude cancelled or rejected sessions
          const activeSessions = sessions.filter(s => {
            const status = s.status?.toLowerCase();
            return status && !['cancelled', 'rejected', 'declined'].includes(status);
          });
          allSessions.push(...activeSessions);
        }
      } catch (error) {
        console.warn(`Error obteniendo sesiones para tutor ${tutorId}:`, error);
      }
    }
    
    // Convert tutoring sessions to booking format
    for (const session of allSessions) {
      if (session.scheduledStart && session.scheduledEnd) {
        const sessionStart = new Date(session.scheduledStart);
        const sessionEnd = new Date(session.scheduledEnd);
        
        // If session has parentAvailabilityId and slotIndex, use them directly
        if (session.parentAvailabilityId && session.slotIndex !== undefined) {
          allBookings.push({
            id: session.id,
            parentAvailabilityId: session.parentAvailabilityId,
            slotIndex: session.slotIndex,
            sessionId: session.id,
            studentEmail: session.studentEmail || session.studentId,
            bookedAt: session.createdAt || session.requestedAt || new Date(),
            scheduledStart: sessionStart,
            scheduledEnd: sessionEnd
          });
        } else {
          // Otherwise, find which availability and slot index this session belongs to
          for (const availability of availabilities) {
            if (availability.tutorId === session.tutorId) {
              const availabilityStart = new Date(availability.startDateTime);
              const availabilityEnd = new Date(availability.endDateTime);
              
              // Check if session overlaps with this availability
              if (sessionStart >= availabilityStart && sessionStart < availabilityEnd) {
                // Calculate slot index based on time difference
                const hoursDiff = (sessionStart - availabilityStart) / (1000 * 60 * 60);
                const slotIndex = Math.floor(hoursDiff);
                
                // Create a booking object from the session
                allBookings.push({
                  id: session.id,
                  parentAvailabilityId: availability.id,
                  slotIndex: slotIndex,
                  sessionId: session.id,
                  studentEmail: session.studentEmail || session.studentId,
                  bookedAt: session.createdAt || session.requestedAt || new Date(),
                  scheduledStart: sessionStart,
                  scheduledEnd: sessionEnd
                });
                break; // Found the matching availability, move to next session
              }
            }
          }
        }
      }
    }
    
    // Also get traditional slot bookings (if any)
    for (const availability of availabilities) {
      try {
        const bookings = await TutoringSessionService.getSlotBookingsForAvailability(availability.id);
        if (bookings.length > 0) {
          allBookings.push(...bookings);
        }
      } catch (error) {
        console.warn(`Error obteniendo reservas para disponibilidad ${availability.id}:`, error);
      }
    }
    
    return allBookings;
  }
  
  static isSlotAvailable(slot) {
    const now = new Date();
    const slotStart = new Date(slot.startDateTime);
    const isFuture = slotStart > now;
    const isNotBooked = !slot.isBooked;
    return isFuture && isNotBooked;
  }
  
  static groupSlotsByDate(slots) {
    const grouped = {};
    
    slots.forEach(slot => {
      const date = new Date(slot.startDateTime);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;

      const localMidnight = new Date(y, date.getMonth(), date.getDate());

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: localMidnight,
          slots: []
        };
      }
      
      grouped[dateKey].slots.push(slot);
    });
    
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].slots.sort((a, b) => 
        new Date(a.startDateTime) - new Date(b.startDateTime)
      );
    });
    
    return grouped;
  }
  
  static formatSlotInfo(slot) {
    const startTime = new Date(slot.startDateTime);
    const endTime = new Date(slot.endDateTime);
    
    return {
      id: slot.id,
      date: startTime.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      startTime: startTime.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      endTime: endTime.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      duration: '1h',
      course: slot.course,
      location: slot.location,
      description: slot.description,
      tutorId: slot.tutorId,
      tutorEmail: slot.tutorEmail,
      isAvailable: this.isSlotAvailable(slot),
      isBooked: slot.isBooked,
      bookedBy: slot.bookedBy
    };
  }
  
  static getConsecutiveAvailableSlots(slots, count = 1) {
    const availableSlots = this.getAvailableSlots(slots);
    const consecutiveGroups = [];
    
    for (let i = 0; i <= availableSlots.length - count; i++) {
      const group = [];
      let isConsecutive = true;
      
      for (let j = 0; j < count; j++) {
        const currentSlot = availableSlots[i + j];
        
        if (!currentSlot) {
          isConsecutive = false;
          break;
        }
        
        if (j > 0) {
          const prevSlot = availableSlots[i + j - 1];
          const currentStart = new Date(currentSlot.startDateTime);
          const prevEnd = new Date(prevSlot.endDateTime);
          
          if (Math.abs(currentStart - prevEnd) > 60000) {
            isConsecutive = false;
            break;
          }
        }
        
        group.push(currentSlot);
      }
      
      if (isConsecutive && group.length === count) {
        consecutiveGroups.push(group);
      }
    }
    
    return consecutiveGroups;
  }
  
  static validateSlotForBooking(slot) {
    const errors = [];
    
    if (!slot) {
      errors.push('Slot no encontrado');
      return { isValid: false, errors };
    }
    
    if (slot.isBooked) {
      errors.push(`Este horario ya está reservado por ${slot.bookedBy || 'otro estudiante'}`);
    }
    
    const now = new Date();
    const slotStart = new Date(slot.startDateTime);
    
    if (slotStart <= now) {
      errors.push('No se puede reservar un horario que ya pasó');
    }
    
    const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
    if (slotStart < oneHourFromNow) {
      errors.push('Debe reservar con al menos 1 hora de anticipación');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  static async checkSlotAvailabilityRealTime(slot, TutoringSessionService) {
    try {
      const existingBooking = await TutoringSessionService.getSlotBooking(
        slot.parentAvailabilityId,
        slot.slotIndex,
        slot.tutorId
      );
      
      if (existingBooking) {
        return {
          available: false,
          reason: `Este horario ya fue reservado por otro estudiante`,
          booking: existingBooking
        };
      }
      
      return {
        available: true,
        reason: 'Slot disponible',
        booking: null
      };
    } catch (error) {
      console.error('Error verificando disponibilidad en tiempo real:', error);
      return {
        available: false,
        reason: 'Error verificando disponibilidad',
        booking: null
      };
    }
  }

  static extractCourseFromTitle(title) {
    if (!title) return 'Tutoría General';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('cálculo') || titleLower.includes('calculo')) return 'Cálculo';
    if (titleLower.includes('física') || titleLower.includes('fisica')) return 'Física';
    if (titleLower.includes('matemáticas') || titleLower.includes('matematicas') || titleLower.includes('math')) return 'Matemáticas';
    if (titleLower.includes('programación') || titleLower.includes('programacion') || titleLower.includes('programming')) return 'Programación';
    if (titleLower.includes('química') || titleLower.includes('quimica')) return 'Química';
    if (titleLower.includes('biología') || titleLower.includes('biologia')) return 'Biología';
    if (titleLower.includes('historia')) return 'Historia';
    if (titleLower.includes('inglés') || titleLower.includes('ingles') || titleLower.includes('english')) return 'Inglés';
    if (titleLower.includes('estadística') || titleLower.includes('estadistica') || titleLower.includes('statistics')) return 'Estadística';
    if (titleLower.includes('economía') || titleLower.includes('economia')) return 'Economía';
    if (titleLower.includes('algebra') || titleLower.includes('álgebra')) return 'Álgebra';
    if (titleLower.includes('geometría') || titleLower.includes('geometria')) return 'Geometría';
    if (titleLower.includes('trigonometría') || titleLower.includes('trigonometria')) return 'Trigonometría';
    if (titleLower.includes('tutoria') || titleLower.includes('tutoría')) {
      return title.replace(/tutoria|tutoría/gi, '').trim() || 'Tutoría General';
    }
    return title.length > 30 ? 'Tutoría General' : title;
  }
}
