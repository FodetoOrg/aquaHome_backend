//@ts-nocheck
import { dashboardDataService } from "../services/dashbaord.service"
import { handleError } from "../utils/errors"
import { FastifyReply, FastifyRequest } from "fastify"


export async function dashboardData(request: FastifyRequest, reply: FastifyReply) {


    try {
        const { from, to } = request.query;
        const dateFilter = from && to ? { from, to } : undefined;
        console.log('dateFilter ',dateFilter)
        const result = await dashboardDataService(request.user,dateFilter)


        return reply.code(201).send(result);
    } catch (e) {
        console.log('error ', e)
        throw handleError(e, request, reply)
    }

}