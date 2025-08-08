import { dashboardData } from "../controllers/dashbaord.controller";
import { FastifyInstance } from "fastify";



export default async function (fastify: FastifyInstance) {
    fastify.get(
        '/',
        {

            preHandler: [fastify.authenticate],
        },
        (request, reply) => dashboardData(request as any, reply as any)
    );


}