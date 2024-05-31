import { isDate, isTime } from "validator";
import { Doctor } from "../models/Doctor";
import { User } from "../models/User";
import { Consultation } from "../models/Consultation";
import { generateToken } from "../utils/generateRandomToken";
import { generatePDF } from "../utils/generatePdf";
import { isValidConsultation, isValidDate, isValidTime } from "../utils/validators";
import { formatDate } from "../utils/formatDate";
import { Op } from "sequelize";


interface ScheduleConsultation {
    consultationDate: string,
    consultationTime: string,
    doctor_id: number,
}

interface UpdateConsultationData {
    consultationDate?: string,
    consultationTime?: string
    isCompleted?: boolean

}

export const getUserById = async (user_id: number | undefined) => {
    let user = await User.findByPk(user_id)
    if (!user) {
        throw new Error('Usuário não encontrado');
    }

    return user
}

export const getDoctorById = async (doctor_id: number) => {
    let doctor = await Doctor.findByPk(doctor_id)
    if (!doctor) {
        throw new Error('Médico não encontrado');
    }

    return doctor
}

export const checkExistingConsultation = async (consultationDate: string, consultationTime: string, doctor_id: number, doctor_name: string) => {
    let hasConsultation = await Consultation.findOne({ where: { consultationDate, consultationTime, doctor_id } })

    if (hasConsultation) {
        throw new Error(`Já existe uma consulta marcada com o Dr. ${doctor_name} para esse horário`)
    }
}

export const createConsultation = async (data: any) => {
    return await Consultation.create(data)
}

export const generateConsultationToken = () => {
    return generateToken(20)
}

export const createConsultationPDF = async (userId: number, username: string, doctorName: string, consultationTime: string, formattedDate: string, doctorSpeciality: string) => {
    return await generatePDF(userId, username, doctorName, consultationTime, formattedDate, doctorSpeciality)
}

export const findConsultations = async (user_id: number | undefined) => {
    try {

        let consultations = await Consultation.findAll({ where: { user_id } })
        if (!consultations || consultations.length === 0) {
            throw new Error(`Não foi encontrado um histórico de consultas`)
        }

        return consultations
    } catch (err) {
        throw err
    }

}

export const findConsultationByToken = async (token: string, user_id: number) => {
    if (!token) {
        throw new Error(`O token deve ser passado como parâmetro na URL`)
    }

    let consultation = await Consultation.findOne({ where: { consultationToken: token, user_id } })
    if (!consultation) {
        throw new Error(`Token inválido!`)
    }

    return consultation
}

export const scheduleConsultation = async (data: ScheduleConsultation, user_id: number, username: string) => {
    const { consultationDate, consultationTime, doctor_id } = data

    isValidConsultation(consultationDate, consultationTime, doctor_id)

    let doctor = await getDoctorById(doctor_id)

    await checkExistingConsultation(consultationDate, consultationTime, doctor_id, doctor.name)

    let formattedDate = formatDate(consultationDate)
    let pdf = await createConsultationPDF(user_id, username, doctor.name, consultationTime, formattedDate, doctor.speciality)

    let consultationToken = generateConsultationToken()
    let newConsultationData = {
        consultationToken, consultationDate, consultationTime, doctor_id, user_id,
        details: {
            doctorName: doctor.name.trim(),
            doctorSpeciality: doctor.speciality,
            username: username,
            pdf: pdf
        }
    }

    return await createConsultation(newConsultationData)
}

export const updateConsultation = async (id: number, user_id: number, username: string, data: UpdateConsultationData) => {
    const { consultationDate, consultationTime, isCompleted } = data

    if (consultationDate || consultationTime) {
        isValidDate(data.consultationDate)
        isValidTime(data.consultationTime)
    }

    let consultation = await Consultation.findOne({ where: { id, user_id } })

    if (!consultation) {
        throw new Error(`Consulta não encontrada`)
    }

    const newDate = consultationDate || consultation.consultationDate
    const newTime = consultationTime || consultation.consultationTime
    const newIsCompleted = isCompleted || consultation.isCompleted
    const formattedDate = formatDate(newDate)

    let hasConsultation = await Consultation.findOne({
        where: {
            id: { [Op.not]: id },
            consultationDate: newDate,
            consultationTime: newTime,
            doctor_id: consultation.doctor_id,
            user_id: { [Op.not]: user_id }
        }
    });

    if (hasConsultation) {
        throw new Error(`O médico já possui uma consulta marcada para esse horário`);
    }

    if (newTime !== consultation.consultationTime || newDate !== consultation.consultationDate) {
        const newPDF = await createConsultationPDF(user_id, username, consultation.details.doctorName, newTime, formattedDate, consultation.details.doctorSpeciality)
        let updatedConsultation = await consultation.update({
            consultationDate, consultationTime, isCompleted: newIsCompleted, details: {
                ...consultation.details,
                pdf: newPDF
            }
        })

        return updatedConsultation

    } else {
        let updatedConsultation = await consultation.update({
            consultationDate, consultationTime, isCompleted: newIsCompleted
        })

        return updatedConsultation
    }
}


