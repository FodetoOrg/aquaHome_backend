
import { FastifyInstance } from 'fastify';
import { getPayments, getPaymentById, getSubscriptionPayments, getRevenueList, getRevenueDetails } from '../controllers/payments.controller';
import { getPaymentsSchema, getPaymentByIdSchema, getRevenueListSchema, getRevenueDetailsSchema } from '../schemas/payments.schema';
import { UserRole } from '../types';

export default async function (fastify: FastifyInstance) {
    // Get payments based on role
    fastify.get(
        '/',
        {
            schema: getPaymentsSchema,
            preHandler: [fastify.authenticate],
        },
        (request, reply) => getPayments(request as any, reply as any)
    );

    fastify.get(
        '/subscription/:id',
        {
            preHandler: [fastify.authenticate],
        },
        (request, reply) => getSubscriptionPayments(request as any, reply as any)
    );

    // Get payment by ID
    fastify.get(
        '/:id',
        {
            schema: getPaymentByIdSchema,
            preHandler: [fastify.authenticate],
        },
        (request, reply) => getPaymentById(request as any, reply as any)
    );

    // Get revenue list for admin (with franchise and subscription details)
    fastify.get(
        '/admin/revenue',
        {
            schema: getRevenueListSchema,
            preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN])],
        },
        (request, reply) => getRevenueList(request as any, reply as any)
    );

    // Get detailed revenue information for a specific payment
    fastify.get(
        '/admin/revenue/:id',
        {
            schema: getRevenueDetailsSchema,
            preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN])],
        },
        (request, reply) => getRevenueDetails(request as any, reply as any)
    );

    fastify.log.info('Payments routes registered');
}
