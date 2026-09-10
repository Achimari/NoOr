import { prisma } from "../prisma/client.js";

const answerSelect = {
  dateKey: true,
  answer: true,
};

const goalAnswerSourceSelect = {
  dailyGoals: {
    select: {
      dateKey: true,
      completedAt: true,
    },
  },
  dailyGoalCheckIns: {
    select: answerSelect,
  },
};

export async function findAllRecoveryAnswerRows() {
  return prisma.checkInHistory.findMany({ select: answerSelect });
}

export async function findRecoveryAnswerRowsByUserId(userId) {
  return prisma.checkInHistory.findMany({ where: { userId }, select: answerSelect });
}

export async function findAllReadingAnswerRows() {
  return prisma.readingCheckIn.findMany({ select: answerSelect });
}

export async function findReadingAnswerRowsByUserId(userId) {
  return prisma.readingCheckIn.findMany({ where: { userId }, select: answerSelect });
}

export async function findAllGoalAnswerSources() {
  return prisma.auth.findMany({ select: goalAnswerSourceSelect });
}

export async function findGoalAnswerSourceByUserId(userId) {
  return prisma.auth.findUnique({ where: { id: userId }, select: goalAnswerSourceSelect });
}
